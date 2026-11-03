import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { isCsharpVoidTargetType } from "../../../dist/target-model/types/index.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`native ${surface ?? "native"} Error abstractions observe original live fields without allocation`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function name(error: Error): string { return error.name; }
      export function message(error: Error): string { return error.message; }
      export function stack(error: Error): string | undefined { return error.stack; }
      export function optionalName(error: Error | undefined): string | undefined { return error?.name; }
      export function optionalStack(error: Error | undefined): string | undefined { return error?.stack; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-observations-${surface ?? "native"}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
using RuntimeError = Tsonic.CSharp.Runtime.Error;

var source = new MutableException("original");
Exception retained = source;
if (Generated.name(retained) != nameof(MutableException) || Generated.message(retained) != "original" || Generated.stack(retained) is not null)
    throw new Exception("original observations");
source.CurrentMessage = "updated";
source.CurrentStack = "authored stack";
if (Generated.name(retained) != source.GetType().Name || Generated.message(retained) != source.Message || Generated.stack(retained) != source.StackTrace)
    throw new Exception("live observations");
if (Generated.optionalName(null) is not null || Generated.optionalStack(null) is not null ||
    Generated.optionalName(retained) != source.GetType().Name || Generated.optionalStack(retained) != source.StackTrace)
    throw new Exception("native optional observations");
var native = new InvalidOperationException("native failure");
if (Generated.name(native) != nameof(InvalidOperationException) || Generated.message(native) != native.Message || Generated.stack(native) is not null)
    throw new Exception("native original observations");
if (!ReferenceEquals(retained, source)) throw new Exception("native observer identity");
var runtime = new RuntimeError("original");
Exception runtimeView = runtime;
runtime.name = "UpdatedError"; runtime.message = "updated"; runtime.stack = "authored stack";
if (Generated.name(runtimeView) != runtime.GetType().Name || Generated.message(runtimeView) != runtimeView.Message ||
    Generated.stack(runtimeView) != runtimeView.StackTrace) throw new Exception("explicit runtime object retains its native Exception view");
ObservationBytes(retained);
for (var replay = 0; replay < 3; replay++)
    if (ObservationBytes(retained) != 0) throw new Exception("unexpected observation allocation");

static long ObservationBytes(Exception error) {
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 10_000; index++) {
        GC.KeepAlive(Generated.name(error)); GC.KeepAlive(Generated.message(error)); GC.KeepAlive(Generated.stack(error));
        GC.KeepAlive(Generated.optionalName(error)); GC.KeepAlive(Generated.optionalStack(error));
    }
    return GC.GetAllocatedBytesForCurrentThread() - before;
}

sealed class MutableException : Exception {
    public MutableException(string message) : base(message) { CurrentMessage = message; }
    public string CurrentMessage;
    public string? CurrentStack;
    public override string Message => CurrentMessage;
    public override string? StackTrace => CurrentStack;
}
`);
  });

  test(`explicit ${surface ?? "native"} Error stack capture keeps its exact writable native parameter`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function capture(error: Error): void { Error.captureStackTrace(error); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /capture\(System\.Exception error\)/u);
    const program = compiled.result.program;
    const captures = program.source.navigation.nodes.filter(node => program.source.ast.is.IsCallExpression(node))
      .map(node => ({ node, selected: program.records.selectedCall.get(node)?.target }))
      .filter(entry => entry.selected?.kind === "resolved" &&
        entry.selected.call.targetMember.id.endsWith("System.Runtime.ExceptionServices.ExceptionDispatchInfo.SetCurrentStackTrace"));
    assert.equal(captures.length, 1, "the actual native capture call has one completed selection");
    assert.equal(captures[0].selected.call.discardResult, true, "the source void contract discards the real physical result");
    assert.equal(captures[0].selected.call.targetMember.returnType.id.endsWith("System.Exception"), true,
      "the physical native member still returns the original Exception");
    assert.equal(isCsharpVoidTargetType(program.records.nodeTargetType.get(captures[0].node)), true,
      "the same completed call owns the source void expression result");
    executeCsharpConstruction(compiled, `native-error-capture-${surface ?? "native"}`, false, false, [], `
using System;
var original = new Exception("source");
var alias = original;
if (alias.StackTrace is not null) throw new Exception("implicit stack capture");
Tsonic.Generated.Index.capture(alias);
if (!ReferenceEquals(alias, original) || original.StackTrace is null) throw new Exception("explicit capture lost");
`);
  });

  test(`native ${surface ?? "native"} stored ErrorOptions retain aliases, mutable cause, order and exact constructor allocation`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let order: string = "";
      function message(): string { order += "message;"; return "ordered"; }
      function selected(value: ErrorOptions): ErrorOptions { order += "options;"; return value; }
      export function makeOptions(cause: Error): ErrorOptions { return { cause }; }
      export function update(value: ErrorOptions, cause: Error): ErrorOptions {
        const alias = value;
        alias.cause = cause;
        return alias;
      }
      export function options(value: ErrorOptions | undefined): Error { return new Error("optional", value); }
      export function ordered(value: ErrorOptions): Error { order = ""; return new Error(message(), selected(value)); }
      export function orderValue(): string { return order; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /ErrorObject|Tsonic\.CSharp\.Runtime\.Error\b|ConditionalWeakTable|Reflection/u);
    executeCsharpConstruction(compiled, `native-stored-error-options-${surface ?? "native"}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var first = new Exception("first");
var second = new InvalidOperationException("second");
var options = Generated.makeOptions(first);
var alias = options;
var retained = Generated.options(options);
if (!ReferenceEquals(retained.InnerException, first)) throw new Exception("original stored cause identity");
if (!ReferenceEquals(Generated.update(alias, second), options)) throw new Exception("stored options identity was copied");
var changed = Generated.options(options);
if (!ReferenceEquals(changed.InnerException, second) || !ReferenceEquals(retained.InnerException, first) ||
    changed.Message != "optional" || !ReferenceEquals(alias, options)) throw new Exception("live cause and prior exception identity");
var ordered = Generated.ordered(alias);
if (!ReferenceEquals(ordered.InnerException, second) || ordered.Message != "ordered" || Generated.orderValue() != "message;options;")
    throw new Exception("message before one options evaluation");
if (Generated.options(null).InnerException is not null) throw new Exception("native optional options absence");
for (var iteration = 0; iteration < 1024; iteration++) {
    GC.KeepAlive(Generated.options(options));
    GC.KeepAlive(new Exception("optional", second));
}
var before = GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 4096; iteration++) GC.KeepAlive(Generated.options(options));
var actual = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 4096; iteration++) GC.KeepAlive(new Exception("optional", second));
var reference = GC.GetAllocatedBytesForCurrentThread() - before;
if (actual != reference) throw new Exception($"stored options projection allocation {actual} != {reference}");
GC.KeepAlive(retained); GC.KeepAlive(options); GC.KeepAlive(alias);
`);
  });

  test(`native ${surface ?? "native"} Error capture preserves first, repeated and thrown traces`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let evaluations: number = 0;
      let order: string = "";
      function selected(error: Error): Error { evaluations += 1; order += "argument;"; return error; }
      export function capture(error: Error): void { Error.captureStackTrace(error); }
      export function captureAlias(error: Error): void { const alias = error; Error.captureStackTrace(alias); }
      export function captureArgument(error: Error): void {
        order += "before;";
        Error.captureStackTrace(selected(error));
        order += "after;";
      }
      export function voidCapture(error: Error): void { return Error.captureStackTrace(selected(error)); }
      export function argumentCount(): number { return evaluations; }
      export function argumentOrder(): string { return order; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const calls = program.source.navigation.nodes.filter(node => program.source.ast.is.IsCallExpression(node))
      .map(node => ({ node, selected: program.records.selectedCall.get(node)?.target,
        emission: program.records.targetCallEmission.get(node) }))
      .filter(entry => entry.selected?.kind === "resolved" && entry.selected.call.condition !== undefined);
    assert.equal(calls.length, 4, "all capture forms use the same completed conditional-native operation");
    for (const entry of calls) {
      const selection = entry.selected.call;
      assert.equal(selection.discardResult, true, "the physical Exception result never becomes a source value");
      assert.equal(isCsharpVoidTargetType(program.records.nodeTargetType.get(entry.node)), true, "the source call remains void");
      assert.equal(selection.condition.kind, "argument-property-absent");
      assert.equal(selection.condition.targetParameterIndex, 0);
      assert.equal(selection.condition.property.targetName, "StackTrace");
      assert.equal(selection.condition.property.readonly, true);
      assert.equal(entry.emission.invocation.kind, "guarded-method", "planning consumes the sealed operation, not an Error name");
      assert.equal(entry.emission.invocation.argumentIndex, selection.condition.targetParameterIndex);
      assert.equal(entry.emission.invocation.propertyName, selection.condition.property.targetName,
        "planning consumes the completed physical property name");
      assert.equal(entry.emission.invocation.argumentType === selection.targetMember.parameters[0].type, true,
        "the completed physical operand carrier is transported without reselection");
    }
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /ErrorObject|Tsonic\.CSharp\.Runtime\.Error\b|ConditionalWeakTable|Reflection/u);
    assert.equal(compiled.artifacts.has("ref/Index.cs"), false, "the handwritten counterpart has its own source file");
    const reference = `
using System;
using System.Runtime.ExceptionServices;

namespace Tsonic.Reference
{
    public static class Index
    {
        public static void capture(Exception error)
        {
            if (error.StackTrace is null)
            {
                ExceptionDispatchInfo.SetCurrentStackTrace(error);
            }
        }
    }
}
`;
    executeCsharpConstruction({ ...compiled, artifacts: new Map([...compiled.artifacts, ["ref/Index.cs", reference]]) },
      `native-error-guarded-capture-${surface ?? "native"}`, false, false, [], `
using System;
using System.Runtime.ExceptionServices;
using Generated = Tsonic.Generated.Index;

var original = new Exception("first");
var alias = original;
if (original.StackTrace is not null) throw new Exception("construction must not capture");
Generated.capture(original);
var first = original.StackTrace;
if (first is null || !ReferenceEquals(alias, original)) throw new Exception("first capture identity");
Generated.captureAlias(alias);
Generated.capture(original);
if (original.StackTrace != first) throw new Exception("repeated capture must preserve the existing trace");
var thrown = new Exception("thrown");
try { throw thrown; }
catch (Exception recovered) {
    var previous = recovered.StackTrace;
    if (previous is null || !ReferenceEquals(thrown, recovered)) throw new Exception("throw identity");
    Generated.capture(recovered);
    if (recovered.StackTrace != previous) throw new Exception("capture after throw must preserve the existing trace");
}
var argument = new Exception("argument");
Generated.captureArgument(argument);
if (Generated.argumentCount() != 1 || Generated.argumentOrder() != "before;argument;after;" || argument.StackTrace is null)
    throw new Exception("single argument evaluation and source order");
var beforeVoid = argument.StackTrace;
Generated.voidCapture(argument);
if (Generated.argumentCount() != 2 || Generated.argumentOrder() != "before;argument;after;argument;" || argument.StackTrace != beforeVoid)
    throw new Exception("void expression and alias identity");

`);
  });
}
