import { csharpTestSourceProgram } from "../../helpers/target-source-program.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { collectTargetSourceProfileContributions } from "../../../../tsonic/packages/host/dist/target/source-profile.js";
import { errorOriginDomainSource } from "../../../../tsonic/test/fixtures/error-origin-domains.mjs";
import { representationServices, representations } from "../../representation/host-fixture.mjs";
import { csharpSourceProfileContributions, csharpJsSurfaceSourceProfileContributions } from "../../../dist/source/profiles/declarations.js";
import { createSourceErrorProviderFixture } from "../../fixtures/dotnet-provider/source-error-bindings.mjs";

// nextgen C-2542: the Error storage-demand facts (observed native roots, closed admission domains, external and ambient
// constructor ownership, inherited-initialization invalidation per constructor footprint) are Host facts:
// createSourceErrorStorageDemandQuery and createSourceStorageQuery are Host-internal and no longer exported. Those
// assertions, and the whole "native Error allocation preserves exact <footprint> inherited initialization" family over
// errorConstructorFootprintSource, move to Host tests (request R-T6-5). This file keeps the C# fact: the canonical
// physical Error carrier of each formal's Host slot is System.Exception on both surfaces and both creation forms.
for (const jsEnabled of [false, true]) {
  for (const called of [false, true]) {
  test(`C# ${jsEnabled ? "JS" : "native"} ${called ? "call" : "new"} Error formals take the canonical native Error carrier`, () => {
    const profile = collectTargetSourceProfileContributions({ project: {}, projectRoot: "/src", projectDirectory: "/src",
      target: { id: "csharp", options: {} }, targetPackId: jsEnabled ? "js" : "csharp", selectedCapabilities: [], selectedSurfaces: [],
      targetContributions: jsEnabled ? csharpJsSurfaceSourceProfileContributions() : csharpSourceProfileContributions({ selectedSurfaceIds: [] }) });
    assert.equal(profile.diagnostics.length === 0, true);
    const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: new Map([
      ["/src/index.ts", errorOriginDomainSource(called)], ...profile.files.map(file => [file.path, file.text]),
    ]), compilerOptions: { strict: true, noLib: true, skipLibCheck: true, module: "esnext", moduleResolution: "bundler" } }).checkSource();
    assert.equal(checked.diagnostics.length === 0, true);
    const source = csharpTestSourceProgram(checked);
    const file = source.sourceFiles.find(file => source.syntax.getFileName(file) === "/src/index.ts");
    const providers = createSourceErrorProviderFixture();
    const declaration = name => source.syntax.statements(file).find(node => source.syntax.is.IsFunctionDeclaration(node) &&
      source.syntax.text(source.syntax.name(node)) === name);
    // The Error carrier is the one representation of the Host slot type of each formal (nextgen C-2542, I6): the
    // declared Error profile type is published through the program providers, not resolved from a checker Type.
    const represent = representations(representationServices({ facts: source.facts, ast: source.syntax, nodes: [],
      host: { sourceFacts: source.sourceFacts } }, { providers, profile: jsEnabled ? "js" : "native" }));
    for (const [name, expectedCarrier] of [["inspect", "System.Exception"], ["privateInspect", "System.Exception"]]) {
      const formal = source.syntax.parameters(declaration(name))[0];
      const carrier = represent.slot(formal);
      assert.equal(carrier?.id === expectedCarrier, true, `${name}: canonical physical Error carrier of the Host slot`);
    }
  });
  }
}
