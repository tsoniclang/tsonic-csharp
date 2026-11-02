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
}
