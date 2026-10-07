import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery, defaultSourceStorageLimits } from "@tsonic/target-api/analysis";
import { collectTargetSourceProfileContributions } from "../../../../tsonic/packages/host/dist/target/source-profile.js";
import { errorConstructorFootprintSource, errorOriginDomainSource } from "../../../../tsonic/test/fixtures/error-origin-domains.mjs";
import { createCsharpErrorStorageDemandQuery } from "../../../dist/analysis/objects/error-storage-demands.js";
import { resolveSourceProfileType } from "../../../dist/policy/types/resolution/source-profiles.js";
import { createCsharpSourceProfileStorageEffects } from "../../../dist/policy/operations/source-profiles/source-storage-effects.js";
import { csharpSourceProfileContributions, csharpJsSurfaceSourceProfileContributions } from "../../../dist/source/profiles/source-profile-declarations.js";

for (const jsEnabled of [false, true]) {
  for (const called of [false, true]) {
  test(`C# ${jsEnabled ? "JS" : "native"} ${called ? "call" : "new"} Error inference requires complete admitted origins`, () => {
    const profile = collectTargetSourceProfileContributions({ project: {}, projectRoot: "/src", projectDirectory: "/src",
      target: { id: "csharp", options: {} }, targetPackId: jsEnabled ? "js" : "csharp", selectedCapabilities: [], selectedSurfaces: [],
      targetContributions: jsEnabled ? csharpJsSurfaceSourceProfileContributions() : csharpSourceProfileContributions({ selectedSurfaceIds: [] }) });
    assert.equal(profile.diagnostics.length === 0, true);
    const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: new Map([
      ["/src/index.ts", errorOriginDomainSource(called)], ...profile.files.map(file => [file.path, file.text]),
    ]), compilerOptions: { strict: true, noLib: true, skipLibCheck: true, module: "esnext", moduleResolution: "bundler" } }).checkSource();
    assert.equal(checked.diagnostics.length === 0, true);
    const source = createTargetSourceProgram(checked);
    const file = source.sourceFiles.find(file => source.ast.getFileName(file) === "/src/index.ts");
    const demand = createCsharpErrorStorageDemandQuery(source, createSourceStorageQuery(source, [file], defaultSourceStorageLimits,
      createCsharpSourceProfileStorageEffects(source)));
    const declaration = name => source.ast.statements(file).find(node => source.ast.is.IsFunctionDeclaration(node) &&
      source.ast.text(source.ast.name(node)) === name);
    const host = { ast: source.ast, hasSemantics: file => source.semantics.includes(file), errorStorageDemands: demand };
    const identity = { kind: "error", sourceName: "Error", errorName: "Error", baseException: true };
    for (const [name, expectedDomain, expectedCarrier] of [
      ["inspect", "open", "System.Exception"], ["privateInspect", "complete", "Tsonic.CSharp.Runtime.Error"],
    ]) {
      const formal = source.ast.parameters(declaration(name))[0];
      const observed = demand.storageOriginsFor(formal);
      assert.equal(observed.kind === "resolved" && observed.origins.length > 0 &&
        observed.origins.every(origin => demand.isNativeConstructor(origin.node)), true, `${name}: same observed native roots`);
      const domain = demand.closedStorageOriginsFor(formal);
      assert.equal(domain.kind === expectedDomain, true, `${name}: exact admission proof`);
      const carrier = resolveSourceProfileType({ host }, identity, [], formal);
      assert.equal(carrier?.id === expectedCarrier, true, `${name}: canonical physical Error carrier`);
    }
    let aliased;
    let unowned;
    let external;
    const visit = node => {
      if (source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "aliased") aliased = node;
      if (source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "unowned") unowned = node;
      if (source.ast.is.IsReturnStatement(node) && source.ast.parent(source.ast.parent(node)) === declaration("construct"))
        external = source.ast.as.AsReturnStatement(node).Expression;
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
    assert.equal(aliased !== undefined && external !== undefined && unowned !== undefined, true);
    assert.equal(demand.closedStorageOriginsFor(aliased).kind === "complete", true, "immutable owned global constructor alias");
    assert.equal(demand.closedStorageOriginsFor(external).kind === "open", true, "signature identity does not own an external constructor value");
    assert.equal(demand.invalidationFor(source.ast.parameters(declaration("construct"))[1], external, new Set()).kind === "unresolved", true,
      "a native prototype signature cannot certify purity of an external constructor value");
    assert.equal(demand.closedStorageOriginsFor(unowned).kind === "open", true, "ambient external values are not owned global constructors");
  });
  }
  for (const [footprint, expected] of [["mutating", "invalidated"], ["readonly", "preserved"], ["deferred", "preserved"],
    ["receiver", "preserved"], ["bound", "invalidated"]]) {
    test(`C# ${jsEnabled ? "JS" : "native"} native Error allocation preserves exact ${footprint} inherited initialization`, () => {
      const profile = collectTargetSourceProfileContributions({ project: {}, projectRoot: "/src", projectDirectory: "/src",
        target: { id: "csharp", options: {} }, targetPackId: jsEnabled ? "js" : "csharp", selectedCapabilities: [], selectedSurfaces: [],
        targetContributions: jsEnabled ? csharpJsSurfaceSourceProfileContributions() : csharpSourceProfileContributions({ selectedSurfaceIds: [] }) });
      assert.equal(profile.diagnostics.length === 0, true);
      const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: new Map([
        ["/src/index.ts", errorConstructorFootprintSource(footprint)], ...profile.files.map(file => [file.path, file.text]),
      ]), compilerOptions: { strict: true, noLib: true, skipLibCheck: true, module: "esnext", moduleResolution: "bundler" } }).checkSource();
      assert.equal(checked.diagnostics.length === 0, true);
      const source = createTargetSourceProgram(checked);
      const file = source.sourceFiles.find(file => source.ast.getFileName(file) === "/src/index.ts");
      const demand = createCsharpErrorStorageDemandQuery(source, createSourceStorageQuery(source, [file], defaultSourceStorageLimits,
        createCsharpSourceProfileStorageEffects(source)));
      const declarations = new Map();
      const visit = node => {
        if (source.ast.is.IsVariableDeclaration(node)) declarations.set(source.ast.text(source.ast.name(node)), node);
        source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      visit(file);
      const owner = declarations.get("original");
      const expression = source.ast.as.AsVariableDeclaration(declarations.get("created"))?.Initializer;
      assert.equal(owner !== undefined && expression !== undefined, true);
      assert.equal(demand.isNativeConstructor(expression), true, "the inherited constructor selects the owned native Error protocol");
      assert.equal(demand.closedStorageOriginsFor(expression).kind === "complete", true, "fresh result ownership is complete but is not a purity proof");
      assert.equal(demand.invalidationFor(owner, expression, new Set()).kind, expected);
    });
  }
}
