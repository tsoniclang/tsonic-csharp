import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNativeErrorWriteRefusals } from "../../helpers/native-error-refusals.mjs";

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
    const compiled = compileCsharpSource({ surface: jsEnabled ? "js" : "native", sourceText: files["/src/index.ts"],
      files: { "helpers.ts": files["/src/helpers.ts"] } });
    assertNativeErrorWriteRefusals(compiled, ["value.value.value.message"]);
  });
  test(`C# ${jsEnabled ? "JS" : "native"} Error readonly cross-file nested generic values retain native identity`, () => {
    const compiled = compileCsharpSource({ surface: jsEnabled ? "js" : "native", sourceText: `
      import { transport, read } from "./helpers.js";
      export function observe(original: Error): Error { return read(transport({ value: { value: original } })); }
      export function run(): boolean {
        const original = new Error("original");
        const alias = observe(original);
        return alias === original && alias.message === "original";
      }
    `, files: { "helpers.ts": `
      export interface SourceBox<Value> { readonly value: Value; }
      export interface DestinationBox<Value> { readonly value: Value; }
      export function transport(value: SourceBox<SourceBox<Error>>): SourceBox<SourceBox<Error>> { return value; }
      export function read(value: SourceBox<SourceBox<Error>>): Error { return value.value.value; }
    ` } });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /(?:System\.)?Exception/u);
    assert.doesNotMatch(emitted, /Tsonic\.CSharp\.Runtime\.Error|ErrorObject/u);
    executeCsharpConstruction(compiled, `error-native-readonly-nested-${jsEnabled ? "js" : "native"}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var original = new Exception("original");
if (!Generated.run() || !ReferenceEquals(Generated.observe(original), original))
    throw new Exception("cross-file nested readonly Error lost native identity");
`);
  });
  test(`C# ${jsEnabled ? "JS" : "native"} distinct readonly interface nesting retains its measured native forwarding refusal`, () => {
    const compiled = compileCsharpSource({ surface: jsEnabled ? "js" : "native", sourceText: `
      import { transport, read } from "./helpers.js";
      export function observe(original: Error): Error { return read(transport({ value: { value: original } })); }
      export function run(): boolean {
        const original = new Error("original");
        const alias = observe(original);
        return alias === original && alias.message === "original";
      }
    `, files: { "helpers.ts": `
      export interface SourceBox<Value> { readonly value: Value; }
      export interface DestinationBox<Value> { readonly value: Value; }
      export function transport(value: SourceBox<SourceBox<Error>>): DestinationBox<DestinationBox<Error>> { return value; }
      export function read(value: DestinationBox<DestinationBox<Error>>): Error { return value.value.value; }
    ` } });
    assert.equal(compiled.sourceDiagnosticsText, "", "the original distinct-interface program remains checked and preserved");
    assert.equal(compiled.result.diagnostics.length, 3, "the three measured open and nested forwarding relations remain explicit");
    for (const diagnostic of compiled.result.diagnostics) {
      // nextgen C-2542: CSHARP_UNSUPPORTED_AST is split; this site's .NET reason is the unproven forwarding conversion.
      assert.equal(diagnostic.code, "CSHARP_INTERFACE_FORWARDING_CONVERSION_NOT_PROVEN");
      assert.equal(diagnostic.message, "An analyzed interface property has no exact native forwarding conversion.");
      assert.equal(diagnostic.sourceNode !== undefined, true, "the existing native forwarding owner retains its actual source");
    }
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "unsupported native variance never publishes invalid C# or a wrapper");
  });
}

for (const surface of ["native", "js"]) {
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
    const { syntax, sourceFiles, facts } = compiled.result.program.source;
    const selections = facts.navigation.nodesForFiles(sourceFiles).map(node =>
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
var retained = RetainedCause();
GC.Collect(); GC.WaitForPendingFinalizers(); GC.Collect();
if (!retained.Cause.TryGetTarget(out var retainedCause) || !ReferenceEquals(retained.Outer.InnerException, retainedCause))
    throw new Exception("native cause lifetime or reference identity");
GC.KeepAlive(retained.Outer);
NativeBytes(inner); GeneratedBytes(inner);
for (var replay = 0; replay < 3; replay++)
    if (GeneratedBytes(inner) != NativeBytes(inner)) throw new Exception("hidden options allocation or wrapper");

static (Exception Outer, WeakReference<Exception> Cause) RetainedCause() {
    var cause = new Exception("retained");
    return (Generated.direct("message", cause), new WeakReference<Exception>(cause));
}
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
    ["plain cause", `export function update(value: Error): void { value.cause = new Error("inner"); }`, "CSHARP_ERROR_READONLY_STORAGE"],
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

for (const surface of ["native", "js"]) {
  test(`C# ${surface} native Error aliases, callable slots and derived binding members keep one identity`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      type Alias = Error;
      class ImplicitError extends Error {}
      export class Box<Value> { constructor(readonly value: Value) {} }
      class HttpError extends Error {
        detail: string = "before";
        constructor(cause: Error) { super("derived", { cause }); this.name = "HttpError"; }
      }
      export function alias(value: Alias): Error { return value; }
      export function generic<Value extends Error>(value: Value): Value { return value; }
      export function defaulted(value: Error = new Error("default")): Error { return value; }
      export function optional(value?: Error): Error | undefined { return value; }
      export function first(...values: Error[]): Error { return values[0]!; }
      function derived(value: HttpError, expected: Error): boolean {
        const { name, message, stack, cause, detail } = value;
        value.detail = "after";
        return name === "HttpError" && message === "derived" && stack === undefined &&
          cause === expected && detail === "before" && value.detail === "after";
      }
      export function run(): boolean {
        const original = new Error("source");
        const box = new Box<Error>(original);
        const inherited = new ImplicitError("inherited", { cause: original });
        if (inherited.cause !== original || inherited.message !== "inherited" || inherited.name !== "ImplicitError") return false;
        return alias(original) === original && generic(original) === original &&
          defaulted(original) === original && defaulted().message === "default" &&
          optional(original) === original && optional() === undefined && first(original) === original &&
          box.value === original && derived(new HttpError(original), original);
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /System\.Exception alias\(System\.Exception value\)/u);
    assert.match(emitted, /Box<System\.Exception>/u);
    assert.match(emitted, /\.GetType\(\)\.Name/u);
    assert.doesNotMatch(emitted, /Tsonic\.CSharp\.Runtime\.Error|ErrorObject|DynamicInvoke/u);
    executeCsharpConstruction(compiled, `native-error-declaration-and-subclass-slots-${surface}`);
  });
}
