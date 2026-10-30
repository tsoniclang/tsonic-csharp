import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { collectTargetSourceProfileContributions } from "../../../../tsonic/packages/host/dist/target/source-profile.js";
import { createCsharpErrorDeclarationQuery, analyzeCsharpNativeErrorAdmission } from "../../../dist/analysis/objects/error-storage-demands.js";
import { resolveSourceProfileType } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { selectCsharpErrorObservationView } from "../../../dist/analysis/source-evidence/types/resolution/source-references.js";
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
      assert.equal(carrier?.id, "System.Exception", `${name}: a declared stored Error never varies with distant writes`);
    }
    for (const constructor of constructors) assert.equal(constructor.value.result.node === constructor.value.node, true,
      "construction retains its original checked expression");
    assert.equal(demand.constructorFor(source.ast.as.AsVariableDeclaration(declarations.get("record")).Initializer).kind,
      "not-applicable", "same-named record fields are not native Error declarations");
    assert.equal(demand.constructorFor({}).kind, "unresolved", "foreign nodes cannot manufacture checked constructors");
    const admission = analyzeCsharpNativeErrorAdmission(source);
    assert.equal(admission.issues.length, 1, "the original nested Error write is refused without reclassifying the independent record field");
    assert.equal(admission.issues[0].code, "CSHARP_ERROR_READONLY_STORAGE");
    assert.equal(admission.issues[0].sourceNode === writes[0].field.node, true, "the refusal points to the original selected field write");
    assert.equal(Object.isFrozen(demand), true);
    assert.equal(Object.isFrozen(constructors[0].value.result.component), true);
    assert.equal("storageFor" in demand || "closedStorageOriginsFor" in demand, false,
      "the C# declaration owner publishes no origin query or compatibility path");
  });
}


function assertImmutableErrorRefusal(compiled) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the original TypeScript program still checks");
  assert.equal(compiled.result.diagnostics.length, 1, "one local immutable-native Error write is refused");
  const issue = compiled.result.diagnostics[0];
  assert.equal(issue.code, "CSHARP_ERROR_READONLY_STORAGE");
  assert.match(issue.message, /immutable after construction.*new Error.*super/u);
  assert.equal(issue.sourceNode !== undefined, true, "the original write owns its diagnostic");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "refusal is before native publication, not silent omission");
}

for (const surface of ["native", "js"]) {
  test(`C# ${surface} immediate Error observations preserve adjacent writes, native casts and subtype identity`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class DetailedError extends Error {
        readonly code: number = 7;
        constructor() { super("original"); }
      }
      export function update(error: Error): Error {
        const before = error.message;
        error.message = before + "!";
        return error;
      }
      export function cast(error: unknown): Error { return error as Error; }
      export function detail(error: DetailedError): number { return error.code; }
      export function run(): boolean {
        const original = new DetailedError();
        const returned = update(original);
        return returned === original && cast(original) === original && detail(original) === 7 && original.message === "original!";
      }
    ` });
    assertImmutableErrorRefusal(compiled);
  });

  test(`C# ${surface} Error formals share one declaration-owned native input across bodies, defaults and emission`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function read(error: Error): string { return error.message; }
      export function write(error: Error): string { error.message = "changed"; return error.message; }
      export function defaulted(error: Error = new Error("fallback")): string { return error.message; }
      export function optional(error?: Error): string | undefined { return error?.message; }
    ` });
    assertImmutableErrorRefusal(compiled);
  });

  test(`C# ${surface} native Error readonly identity retains exact casts, subclass members and foreign-view rejection`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class DetailedError extends Error {
        readonly code: number = 7;
        constructor() { super("original"); this.name = "DetailedError"; }
      }
      export function observe(error: Error): Error { const before = error.message; return error; }
      export function cast(error: unknown): Error { return error as Error; }
      export function detail(error: DetailedError): number { return error.code; }
      export function run(): boolean {
        const original = new DetailedError();
        const returned = observe(original);
        return returned === original && cast(original) === original && detail(original) === 7 &&
          original.message === "original" && original.name === "DetailedError";
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const { source } = program;
    const { ast } = source;
    const observe = source.navigation.nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === "observe");
    assert.equal(observe !== undefined, true, "the native observer is original checked syntax");
    const parameter = ast.parameters(observe)[0];
    const formal = program.records.callableDeclaration.get(observe)?.contract.nativeParameters[0].targetParameter.type;
    assert.equal(formal?.kind === "target-named" && (formal.id === "System.Exception" || formal.id.endsWith("::System.Exception")), true,
      "the same native Exception identity owns storage, formal and result");
    const fields = source.navigation.declarationUses(parameter).map(use => ast.parent(use.reference))
      .filter(node => node !== undefined && ast.is.IsPropertyAccessExpression(node));
    assert.equal(fields.length, 1, "the exact original native readonly field access is retained");
    const demand = createCsharpErrorDeclarationQuery(source);
    const read = fields.find(node => demand.fieldFor(node).value?.accessMode === "read");
    assert.equal(read !== undefined, true);
    const receiver = ast.as.AsPropertyAccessExpression(read).Expression;
    const selected = program.records.nodeTargetType.get(receiver);
    assert.equal(selected !== undefined && targetTypeRefEquals(selected, formal), true, "no secondary writable carrier or copied view");
    const assertion = source.navigation.nodes.find(node => ast.is.IsAsExpression(node));
    assert.equal(assertion !== undefined && targetTypeRefEquals(program.records.nodeTargetType.get(assertion), formal), true,
      "the exact checked cast preserves native reference identity");
    const providers = createSourceErrorProviderFixture();
    const scope = { host: { ast, providers, errorDeclarations: demand, projectTypes: () => ({ directSupertypes: () => [] }) } };
    const foreign = { ...formal, id: "ForeignOwner::Unrelated", csharpBaseType: undefined };
    assert.throws(() => selectCsharpErrorObservationView(scope, receiver, source.semantics.forNode(receiver), foreign),
      /native reference relation to Exception/u, "foreign evidence cannot manufacture native Exception identity");
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(emitted, /Tsonic\.CSharp\.Runtime\.Error|ErrorObject/u);
    executeCsharpConstruction(compiled, `error-native-readonly-identity-${surface}`);
  });

  test(`C# ${surface} native Error formals preserve defaults, omission and identical immutable published slots`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function read(error: Error): string { return error.message; }
      export function identity(error: Error): Error { return error; }
      export function defaulted(error: Error = new Error("fallback")): string { return error.message; }
      export function optional(error?: Error): string | undefined { return error?.message; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const { source } = program;
    for (const name of ["read", "identity", "defaulted", "optional"]) {
      const declaration = source.navigation.nodes.find(node => source.ast.is.IsFunctionDeclaration(node) &&
        source.ast.text(source.ast.name(node)) === name);
      assert.equal(declaration !== undefined, true, `${name}: original declaration`);
      const parameter = source.ast.parameters(declaration)[0];
      const contract = program.records.callableDeclaration.get(declaration)?.contract;
      assert.equal(contract?.nativeParameters.length, 1, `${name}: exactly one native parameter`);
      assert.equal(contract.nativeParameters[0].sourceParameter === parameter, true, `${name}: the original checked slot survives`);
      const native = contract.nativeParameters[0].targetParameter.type;
      const value = getCsharpNullableElementTargetType(native) ?? native;
      assert.equal(value.kind === "target-named" && (value.id === "System.Exception" || value.id.endsWith("::System.Exception")), true,
        `${name}: immutable native declaration, not origin-selected capability`);
      const runtimeDefault = program.records.runtimeDefault.get(parameter);
      if (name === "defaulted") assert.equal(runtimeDefault !== undefined && targetTypeRefEquals(runtimeDefault.parameterType, native), true,
        "the default initializer consumes the same published native input");
      const body = runtimeDefault?.valueType ?? native;
      assert.equal(targetTypeRefEquals(program.records.callableParameter.get(parameter)?.carrier, body), true,
        `${name}: body/default and native emission agree`);
      for (const use of source.navigation.declarationUses(parameter)) {
        const parent = source.ast.parent(use.reference);
        if (parent === undefined || !source.ast.is.IsPropertyAccessExpression(parent) ||
          source.ast.as.AsPropertyAccessExpression(parent).Expression !== use.reference) continue;
        const selected = program.records.nodeTargetType.get(use.reference);
        const present = getCsharpNullableElementTargetType(selected) ?? selected;
        assert.equal(present?.kind === "target-named" && (present.id === "System.Exception" || present.id.endsWith("::System.Exception")), true,
          `${name}: one exact native body input`);
      }
      assert.equal(Object.isFrozen(contract.nativeParameters[0]) && Object.isFrozen(contract.nativeParameters[0].targetParameter), true,
        `${name}: the slot is immutable before publication`);
    }
    executeCsharpConstruction(compiled, `error-native-formal-defaults-${surface}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var original = new Exception("original");
Exception native = new InvalidOperationException("native");
if (Generated.read(native) != "native" || Generated.defaulted() != "fallback" || Generated.defaulted(native) != "native")
    throw new Exception("native readonly/default contract");
if (Generated.optional(null) is not null || Generated.optional(native) != "native")
    throw new Exception("native optional contract");
if (!ReferenceEquals(Generated.identity(original), original) || original.Message != "original")
    throw new Exception("native immutable identity");
`);
  });

  test(`C# ${surface} native Error constructors project cause once in source order without options storage`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let order: string = "";
      function message(): string { order += "message;"; return "outer"; }
      function cause(value: Error): Error { order += "cause;"; return value; }
      class HttpError extends Error {
        readonly status: number = 400;
        constructor(message: string, cause: Error) { super(message, { cause }); this.name = "HttpError"; }
      }
      class DetailedHttpError extends HttpError {
        constructor(cause: Error) { super("derived", cause); }
      }
      export function make(value: Error): Error { order = ""; return new Error(message(), { cause: cause(value) }); }
      export function direct(message: string, value: Error): Error { return new Error(message, { cause: value }); }
      export function options(value: ErrorOptions | undefined): Error { return new Error("optional", value); }
      export function orderValue(): string { return order; }
      export function identity(value: Error): Error { return value; }
      export function label(value: Error): string { const { name, message } = value; return name + ":" + message; }
      export function run(): boolean {
        const inner = new Error("inner");
        const outer = make(inner);
        const detailed = new DetailedHttpError(inner);
        return outer.cause === inner && outer.message === "outer" && order === "message;cause;" &&
          detailed instanceof Error && detailed instanceof HttpError && detailed.cause === inner &&
          detailed.status === 400 && detailed.name === "DetailedHttpError" && identity(inner) === inner;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /new (?:System\.)?Exception\(/u);
    assert.match(emitted, /\.InnerException/u);
    assert.match(emitted, /\.GetType\(\)\.Name/u);
    assert.doesNotMatch(emitted, /Tsonic\.CSharp\.Runtime\.Error|ErrorObject|new ErrorOptions/u);
    const selections = compiled.result.program.source.navigation.nodes.map(node =>
      compiled.result.program.records.selectedConstruction.get(node)?.target)
      .filter(selection => selection?.kind === "resolved" && selection.call.arguments.some(argument => argument.projection !== undefined));
    assert.equal(selections.length >= 2, true, "both source construction and native base invocation retain checked cause projections");
    for (const selection of selections) {
      const projection = selection.call.arguments.find(argument => argument.projection !== undefined).projection;
      assert.equal(Object.isFrozen(projection) && Object.isFrozen(projection.values), true, "checked cause projection is immutable");
      assert.equal(projection.declaration !== undefined && projection.source !== undefined, true, "cause retains its exact selected declaration and original input");
    }
    executeCsharpConstruction(compiled, `error-native-cause-order-${surface}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
if (!Generated.run()) throw new Exception("native cause, inheritance or identity");
var inner = new Exception("inner");
var outer = Generated.make(inner);
if (!ReferenceEquals(outer.InnerException, inner) || Generated.orderValue() != "message;cause;" ||
    !ReferenceEquals(Generated.identity(inner), inner) || Generated.label(inner) != "Exception:inner")
    throw new Exception("native direct identity and ordered cause");
if (Generated.options(null).InnerException is not null) throw new Exception("native optional cause absence");
NativeBytes(inner); GeneratedBytes(inner);
for (var replay = 0; replay < 3; replay++)
    if (GeneratedBytes(inner) != NativeBytes(inner)) throw new Exception("hidden options allocation or wrapper");

static long NativeBytes(Exception inner) {
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 1_000; index++) GC.KeepAlive(new Exception("message", inner));
    return GC.GetAllocatedBytesForCurrentThread() - before;
}
static long GeneratedBytes(Exception inner) {
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 1_000; index++) GC.KeepAlive(Generated.direct("message", inner));
    return GC.GetAllocatedBytesForCurrentThread() - before;
}
`);
  });

  for (const [label, sourceText, code] of [
    ["plain message", `export function update(value: Error): void { value.message = "changed"; }`, "CSHARP_ERROR_READONLY_STORAGE"],
    ["plain stack", `export function update(value: Error): void { value.stack = "changed"; }`, "CSHARP_ERROR_READONLY_STORAGE"],
    ["plain name", `export function update(value: Error): void { value.name = "Changed"; }`, "CSHARP_ERROR_READONLY_STORAGE"],
    ["subclass message", `class HttpError extends Error {} export function update(value: HttpError): void { value.message = "changed"; }`, "CSHARP_ERROR_READONLY_STORAGE"],
    ["wrong subclass name", `class HttpError extends Error { constructor() { super("original"); this.name = "Wrong"; } } export function make(): Error { return new HttpError(); }`, "CSHARP_ERROR_READONLY_STORAGE"],
    ["structural Error", `export const value: Error = { name: "Error", message: "not native" };`, "CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED"],
  ]) test(`C# ${surface} native Error admission refuses ${label} at its original local source`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "the original checked program is retained as a native refusal");
    assert.equal(compiled.result.diagnostics.length, 1, "one local immutable-native Error refusal");
    const diagnostic = compiled.result.diagnostics[0];
    assert.equal(diagnostic.code, code);
    assert.equal(diagnostic.sourceNode !== undefined, true, "the exact write or object literal owns the refusal");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "no partial program or generated source is published after native admission fails");
  });
}
