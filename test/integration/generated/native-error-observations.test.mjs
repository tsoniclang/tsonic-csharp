import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
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
var source = new NativeObservations("original");
Exception retained = source;
if (Generated.name(retained) != nameof(NativeObservations) || Generated.message(retained) != "original" || Generated.stack(retained) is not null)
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

sealed class NativeObservations : Exception {
    public string CurrentMessage;
    public string? CurrentStack;
    public NativeObservations(string message) : base(message) { CurrentMessage = message; }
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
    assert.match(emitted, /capture\((?:System\.)?Exception error\)/u);
    assert.match(emitted, /ExceptionDispatchInfo\.SetCurrentStackTrace/u);
    executeCsharpConstruction(compiled, `native-error-capture-${surface ?? "native"}`, false, false, [], `
using System;
var original = new Exception("source");
var alias = original;
if (alias.StackTrace is not null) throw new Exception("implicit stack capture");
Tsonic.Generated.Index.capture(alias);
if (!ReferenceEquals(alias, original) || original.StackTrace is null) throw new Exception("explicit capture lost");
try { Tsonic.Generated.Index.capture(alias); throw new Exception("native capture precondition missing"); }
catch (InvalidOperationException) { }
`);
  });
}
