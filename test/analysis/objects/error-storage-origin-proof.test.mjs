import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { collectTargetSourceProfileContributions } from "../../../../tsonic/packages/host/dist/target/source-profile.js";
import { errorConstructorFootprintSource, errorOriginDomainSource } from "../../../../tsonic/test/fixtures/error-origin-domains.mjs";
import { createCsharpErrorDeclarationQuery } from "../../../dist/analysis/objects/error-storage-demands.js";
import { resolveSourceProfileType } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { csharpSourceProfileContributions, csharpJsSurfaceSourceProfileContributions } from "../../../dist/source/profiles/declarations.js";
import { createSourceErrorProviderFixture } from "../../fixtures/dotnet-provider/source-error-bindings.mjs";
import { classifyCsharpSourceProfileType } from "../../../dist/policy/identities/source-types.js";

for (const jsEnabled of [false, true]) {
  for (const called of [false, true]) {
  test(`C# ${jsEnabled ? "JS" : "native"} ${called ? "call" : "new"} Error declarations retain one carrier independently of callers and exports`, () => {
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
    const providers = createSourceErrorProviderFixture();
    const demand = createCsharpErrorDeclarationQuery(source);
    const declaration = name => source.ast.statements(file).find(node => source.ast.is.IsFunctionDeclaration(node) &&
      source.ast.text(source.ast.name(node)) === name);
    const host = { providers };
    const identity = { kind: "error", sourceName: "Error", errorName: "Error", baseException: true };
    for (const name of ["inspect", "privateInspect"]) {
      const formal = source.ast.parameters(declaration(name))[0];
      const selected = demand.parameterFor(formal);
      assert.equal(selected.kind, "resolved", `${name}: exact checked declaration component`);
      assert.equal(selected.value.parameter.component.declaration === formal, true, `${name}: original parameter identity`);
      assert.equal(selected.value.parameter.component.selectedType === source.semantics.forNode(formal).declarations.declaredValueType(formal),
        true, `${name}: exact checked declaration Type`);
      assert.equal(selected.value.access, "read-only", `${name}: the same readonly body requirement, regardless of export or caller`);
      const carrier = resolveSourceProfileType({ host }, identity, []);
      assert.equal(carrier?.id, "Tsonic.CSharp.Runtime.Error", `${name}: logical source Error resolution is context-independent`);
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
    for (const expression of [source.ast.as.AsVariableDeclaration(aliased).Initializer, external,
      source.ast.as.AsVariableDeclaration(unowned).Initializer]) {
      const selected = demand.constructorFor(expression);
      assert.equal(selected.kind, "resolved", "a declared constructor retains its checked signature without claiming allocation origins or purity");
      assert.equal(selected.value.selection === source.semantics.forNode(expression).operations.call(expression), true,
        "the actual selected constructor contract is not reconstructed from a name or caller");
      assert.equal(selected.value.result.component.selectedType === source.semantics.forNode(expression).types.expressionType(expression), true,
        "the exact checked constructor result remains selected");
    }
    assert.equal(demand.constructorFor({}).kind, "unresolved", "a foreign constructor node never manufactures native evidence");
    assert.equal("closedStorageOriginsFor" in demand || "storageFor" in demand, false,
      "the C# owner cannot fall back to removed history queries");
  });
  }
  for (const footprint of ["mutating", "readonly", "deferred", "receiver", "bound"]) {
    test(`C# ${jsEnabled ? "JS" : "native"} Error ${footprint} initialization retains the checked Derived constructor and native ancestry`, () => {
      const profile = collectTargetSourceProfileContributions({ project: {}, projectRoot: "/src", projectDirectory: "/src",
        target: { id: "csharp", options: {} }, targetPackId: jsEnabled ? "js" : "csharp", selectedCapabilities: [], selectedSurfaces: [],
        targetContributions: jsEnabled ? csharpJsSurfaceSourceProfileContributions() : csharpSourceProfileContributions({ selectedSurfaceIds: [] }) });
      assert.equal(profile.diagnostics.length === 0, true);
      const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: new Map([
        ["/src/index.ts", errorConstructorFootprintSource(footprint)], ...profile.files.map(file => [file.path, file.text]),
      ]), compilerOptions: { strict: true, noLib: true, skipLibCheck: true, module: "esnext", moduleResolution: "bundler" } }).checkSource();
      assert.equal(checked.diagnostics.length === 0, true);
      const source = createTargetSourceProgram(checked);
      const declarations = new Map();
      const visit = node => {
        if (source.ast.is.IsVariableDeclaration(node) || source.ast.is.IsClassDeclaration(node))
          declarations.set(source.ast.text(source.ast.name(node)), node);
        source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      for (const file of source.navigation.sourceFiles) visit(file);
      const owner = declarations.get("original");
      const expression = source.ast.as.AsVariableDeclaration(declarations.get("created"))?.Initializer;
      assert.equal(owner !== undefined && expression !== undefined, true);
      const queries = source.semantics.forNode(expression);
      const selection = queries.operations.call(expression);
      assert.equal(selection !== undefined, true, "the original Derived expression retains its selected checked constructor");
      const result = queries.operations.callResult(selection);
      assert.equal(result !== undefined, true, "the selected constructor has its actual checked result component");
      const derived = declarations.get("Derived");
      const base = declarations.get("Base");
      assert.equal(derived !== undefined && base !== undefined, true, "both original class declarations remain present");
      const derivedType = queries.declarations.declaredType(derived);
      assert.equal(queries.types.isIdentical(result.resultType, derivedType), true,
        "the instantiated result is the checked Derived Type, not a fabricated allocation origin");
      assert.equal(queries.types.isIdentical(result.resultType, queries.types.expressionType(expression)), true,
        "the exact checked constructor expression and result component agree");
      const bases = queries.types.instantiatedBaseTypes(derivedType);
      const baseType = queries.declarations.declaredType(base);
      assert.equal(bases?.length, 1, "the checked Derived class has one actual instantiated base");
      assert.equal(queries.types.isIdentical(bases[0], baseType), true, "Derived retains its exact checked Base declaration");
      const inherited = queries.types.instantiatedBaseTypes(baseType);
      assert.equal(inherited?.length, 1, "the checked Base class retains its actual source Error parent");
      const identity = classifyCsharpSourceProfileType(inherited[0], queries, source.ast);
      assert.equal(identity?.kind === "error" && identity.baseException, true, "the original checked parent is the canonical Error profile");
      const carrier = resolveSourceProfileType({ host: { providers: createSourceErrorProviderFixture() } }, identity, []);
      assert.equal(carrier?.id, "Tsonic.CSharp.Runtime.Error", "the checked native ancestry retains writable Error storage");
      const original = source.ast.as.AsVariableDeclaration(owner).Initializer;
      const construction = createCsharpErrorDeclarationQuery(source).constructorFor(original);
      assert.equal(construction.kind, "resolved", "the original Error allocation retains its checked native protocol");
      assert.equal(construction.value.node === original, true, "the selected construction retains the original expression identity");
    });
  }
}
