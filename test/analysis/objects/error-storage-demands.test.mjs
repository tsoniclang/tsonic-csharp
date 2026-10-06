import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { collectTargetSourceProfileContributions } from "../../../../tsonic/packages/host/dist/target/source-profile.js";
import { createCsharpErrorStorageDemandQuery } from "../../../dist/analysis/objects/error-storage-demands.js";
import { csharpSourceProfileContributions, csharpJsSurfaceSourceProfileContributions } from "../../../dist/source/profiles/source-profile-declarations.js";

for (const jsEnabled of [false, true]) {
  test(`C# ${jsEnabled ? "JS" : "native"} Error storage keeps exact cross-file nested generic write origins`, () => {
    const files = {
      "/src/helpers.ts": `
        export interface SourceBox<Value> { readonly value: Value; }
        export interface DestinationBox<Value> { readonly value: Value; }
        export function transport(value: SourceBox<SourceBox<Error>>): DestinationBox<DestinationBox<Error>> { return value; }
        export function write(value: DestinationBox<DestinationBox<Error>>): void { value.value.value.message = "changed"; }
      `,
      "/src/index.ts": `
        import { transport, write } from "./helpers.js";
        declare function providerError(): Error;
        class RecordValue { message = "record"; }
        export function run(): string {
          const original = new Error("original");
          const untouched: Error = new Error("untouched");
          const native: Error = providerError();
          const record = new RecordValue(); record.message = "changed record";
          write(transport({ value: { value: original } }));
          return original.message + untouched.message + native.message;
        }
      `,
    };
    const contributions = collectTargetSourceProfileContributions({ project: {}, projectRoot: "/src",
      projectDirectory: "/src", target: { id: "csharp", options: {} }, targetPackId: jsEnabled ? "js" : "csharp",
      selectedCapabilities: [], selectedSurfaces: [], targetContributions: jsEnabled
        ? csharpJsSurfaceSourceProfileContributions() : csharpSourceProfileContributions({ selectedSurfaceIds: [] }) });
    assert.equal(contributions.diagnostics.length, 0);
    const checked = createCompilerSessionFromFiles({ currentDirectory: "/src",
      files: new Map([...Object.entries(files), ...contributions.files.map(file => [file.path, file.text])]),
      compilerOptions: { noLib: true, strict: true, skipLibCheck: true, module: "esnext", moduleResolution: "bundler", target: "es2022" },
    }).checkSource();
    assert.equal(checked.diagnostics.length, 0,
      formatDiagnostics(checked.diagnostics.filter(diagnostic => diagnostic !== undefined), "/src"));
    const source = createTargetSourceProgram(checked);
    const projectFiles = source.sourceFiles.filter(file => files[source.ast.getFileName(file)] !== undefined);
    const demand = createCsharpErrorStorageDemandQuery(source, createSourceStorageQuery(source, projectFiles));
    const declarations = new Map();
    const visit = node => {
      if (source.ast.is.IsVariableDeclaration(node)) declarations.set(source.ast.text(source.ast.name(node)), node);
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of source.sourceFiles) if (files[source.ast.getFileName(file)] !== undefined) visit(file);
    assert.equal(demand.fieldWrites.length, 1);
    assert.equal(demand.nativeConstructors.length, 2);
    for (const [name, expected] of [["original", "writable"], ["untouched", "immutable"], ["native", "immutable"]]) {
      const declaration = declarations.get(name);
      assert.equal(declaration !== undefined, true, name);
      assert.equal(demand.storageFor(declaration).kind, expected, name);
      const origins = demand.storageOriginsFor(declaration);
      assert.equal(origins.kind, "resolved", name);
      assert.equal(origins.origins.length, 1, name);
      assert.equal(demand.isNativeConstructor(origins.origins[0].node), name !== "native", name);
    }
    for (const constructor of demand.nativeConstructors) assert.equal(demand.isNativeConstructor(constructor), true);
    assert.equal(demand.isNativeConstructor(declarations.get("record")), false);
    assert.equal(demand.isNativeConstructor({}), false);
    assert.equal(Object.isFrozen(demand), true);
    assert.equal(Object.isFrozen(demand.nativeConstructors), true);
  });
}
