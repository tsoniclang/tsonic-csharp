import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { collectTargetSourceProfileContributions } from "../../../../tsonic/packages/host/dist/target/source-profile.js";
import { createCsharpErrorDeclarationQuery } from "../../../dist/analysis/objects/error-storage-demands.js";
import { resolveSourceProfileType } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { createSourceErrorProviderFixture } from "../../fixtures/dotnet-provider/source-error-bindings.mjs";
import { csharpSourceProfileContributions, csharpJsSurfaceSourceProfileContributions } from "../../../dist/source/profiles/declarations.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

for (const jsEnabled of [false, true]) {
  test(`C# ${jsEnabled ? "JS" : "native"} Error declarations keep exact cross-file nested generic writes without origin-selected carriers`, () => {
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
    const demand = createCsharpErrorDeclarationQuery(source);
    const declarations = new Map();
    const visit = node => {
      if (source.ast.is.IsVariableDeclaration(node)) declarations.set(source.ast.text(source.ast.name(node)), node);
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of source.sourceFiles) if (files[source.ast.getFileName(file)] !== undefined) visit(file);
    const nodes = source.navigation.nodesForFiles(projectFiles);
    const writes = nodes.map(node => demand.mutationFor(node)).filter(selection => selection.kind === "resolved")
      .flatMap(selection => selection.value).filter(mutation => mutation.kind === "field");
    const constructors = nodes.filter(node => source.ast.is.IsNewExpression(node))
      .map(node => demand.constructorFor(node)).filter(selection => selection.kind === "resolved");
    assert.equal(writes.length, 1, "the actual selected nested Error write remains present");
    assert.equal(constructors.length, 2, "only checked source Error constructor signatures are selected");
    const providers = createSourceErrorProviderFixture();
    const identity = { kind: "error", sourceName: "Error", errorName: "Error", baseException: true };
    for (const name of ["original", "untouched", "native"]) {
      const declaration = declarations.get(name);
      assert.equal(declaration !== undefined, true, name);
      const carrier = resolveSourceProfileType({ host: { providers } }, identity, []);
      assert.equal(carrier?.id, "Tsonic.CSharp.Runtime.Error", `${name}: a declared stored Error never varies with distant writes`);
    }
    for (const constructor of constructors) assert.equal(constructor.value.result.node === constructor.value.node, true,
      "construction retains its original checked expression");
    assert.equal(demand.constructorFor(source.ast.as.AsVariableDeclaration(declarations.get("record")).Initializer).kind,
      "not-applicable", "same-named record fields are not native Error declarations");
    assert.equal(demand.constructorFor({}).kind, "unresolved", "foreign nodes cannot manufacture checked constructors");
    assert.equal(Object.isFrozen(demand), true);
    assert.equal(Object.isFrozen(constructors[0].value.result.component), true);
    assert.equal("storageFor" in demand || "closedStorageOriginsFor" in demand, false,
      "the C# declaration owner publishes no origin query or compatibility path");
  });
}

for (const surface of ["native", "js"]) {
  test(`C# ${surface} Error formals share one declaration-owned native input across bodies, defaults and emission`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function read(error: Error): string { return error.message; }
      export function write(error: Error): string { error.message = "changed"; return error.message; }
      export function defaulted(error: Error = new Error("fallback")): string { return error.message; }
      export function optional(error?: Error): string | undefined { return error?.message; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const { source } = program;
    for (const name of ["read", "write", "defaulted", "optional"]) {
      const declaration = source.navigation.nodes.find(node => source.ast.is.IsFunctionDeclaration(node) &&
        source.ast.text(source.ast.name(node)) === name);
      assert.equal(declaration !== undefined, true, `${name}: original declaration`);
      const parameter = source.ast.parameters(declaration)[0];
      const contract = program.records.callableDeclaration.get(declaration)?.contract;
      assert.equal(contract?.nativeParameters.length, 1, `${name}: exactly one native parameter is published`);
      assert.equal(contract.nativeParameters[0].sourceParameter === parameter, true, `${name}: the original checked slot survives`);
      const native = contract.nativeParameters[0].targetParameter.type;
      const value = getCsharpNullableElementTargetType(native) ?? native;
      assert.equal(value.kind, "target-named", `${name}: actual native reference carrier`);
      const expected = name === "write" ? "Tsonic.CSharp.Runtime.Error" : "System.Exception";
      assert.equal(value.id === expected || value.id.endsWith(`::${expected}`), true, `${name}: exact native capability, not a stored-value guess`);
      const runtimeDefault = program.records.runtimeDefault.get(parameter);
      if (name === "defaulted") {
        assert.equal(runtimeDefault !== undefined && targetTypeRefEquals(runtimeDefault.parameterType, native), true,
          "the initializer uses the same published incoming native contract");
      }
      const body = runtimeDefault?.valueType ?? native;
      assert.equal(targetTypeRefEquals(program.records.callableParameter.get(parameter)?.carrier, body), true,
        `${name}: native parameter emission reads the same body/default contract`);
      for (const use of source.navigation.declarationUses(parameter)) {
        const parent = source.ast.parent(use.reference);
        if (parent === undefined || !source.ast.is.IsPropertyAccessExpression(parent) ||
            source.ast.as.AsPropertyAccessExpression(parent).Expression !== use.reference) continue;
        const actual = program.records.nodeTargetType.get(use.reference);
        const present = getCsharpNullableElementTargetType(body) ?? body;
        const readonly = source.semantics.forNode(parent).operations.propertyAccess(parent)?.accessMode === "read";
        const selected = getCsharpNullableElementTargetType(actual) ?? actual;
        assert.equal(readonly ? selected?.kind === "target-named" &&
          (selected.id === "System.Exception" || selected.id.endsWith("::System.Exception")) :
          actual !== undefined && (targetTypeRefEquals(actual, body) || targetTypeRefEquals(actual, present)), true,
        `${name}: the published body input admits only the immediate readonly native observation view`);
      }
      assert.equal(Object.isFrozen(contract.nativeParameters[0]) && Object.isFrozen(contract.nativeParameters[0].targetParameter), true,
        `${name}: the native slot is immutable before body publication`);
    }
    executeCsharpConstruction(compiled, `error-formal-default-contract-${surface}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var original = new Tsonic.CSharp.Runtime.Error("original");
Exception native = new InvalidOperationException("native");
if (Generated.read(native) != "native" || Generated.defaulted() != "fallback" || Generated.defaulted(native) != "native")
    throw new Exception("native readonly/default contract");
if (Generated.optional(null) is not null || Generated.optional(native) != "native")
    throw new Exception("native optional contract");
if (Generated.write(original) != "changed" || original.message != "changed")
    throw new Exception("writable native identity");
`);
  });
}
