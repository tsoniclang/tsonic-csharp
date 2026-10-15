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
using RuntimeError = Tsonic.CSharp.Runtime.Error;

var source = new RuntimeError("original");
Exception retained = source;
if (Generated.name(retained) != "Error" || Generated.message(retained) != "original" || Generated.stack(retained) is not null)
    throw new Exception("original observations");
source.name = "UpdatedError";
source.message = "updated";
source.stack = "authored stack";
if (Generated.name(retained) != source.name || Generated.message(retained) != source.message || Generated.stack(retained) != source.stack)
    throw new Exception("live observations");
if (Generated.optionalName(null) is not null || Generated.optionalStack(null) is not null ||
    Generated.optionalName(retained) != source.name || Generated.optionalStack(retained) != source.stack)
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
`);
  });

  test(`explicit ${surface ?? "native"} Error stack capture keeps its exact writable native parameter`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function capture(error: Error): void { Error.captureStackTrace(error); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /capture\(Tsonic\.CSharp\.Runtime\.Error error\)/u);
    executeCsharpConstruction(compiled, `native-error-capture-${surface ?? "native"}`, false, false, [], `
using System;
var original = new Tsonic.CSharp.Runtime.Error("source");
var alias = original;
if (alias.stack is not null) throw new Exception("implicit stack capture");
Tsonic.Generated.Index.capture(alias);
if (!ReferenceEquals(alias, original) || original.stack is null) throw new Exception("explicit capture lost");
`);
  });
}
