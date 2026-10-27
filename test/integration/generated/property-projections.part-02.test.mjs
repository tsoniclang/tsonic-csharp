import test from "node:test";
import assert from "node:assert/strict";
import { nativePropertyProjectionSource, nativePropertyProjectionCostSource } from "../../../../tsonic/test/fixtures/native-property-projections.mjs";
import { assertCsharpCheckingSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native reference own projections preserve null failure, argument evaluation and zero-cost normal assignment", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    type Value = { value: string };
    export function make(value: string): Value { return { value }; }
    export function keys(value: Value) { return Object.keys(value); }
    export function values(value: Value) { return Object.values(value); }
    export function entries(value: Value) { return Object.entries(value); }
    export function has(value: Value): boolean { return Object.hasOwn(value, "value"); }
    export function assign(target: Value, source: Value): Value { return Object.assign(target, source); }
  ` });
  const output = executeCsharpConstruction(compiled, "native-projection-null-receiver", false, false, [], `
using System;
using Index = Tsonic.Generated.Index;
var value = Index.make("before");
var source = Index.make("after");
ExpectNull(() => { _ = Index.keys(null!); });
ExpectNull(() => { _ = Index.values(null!); });
ExpectNull(() => { _ = Index.entries(null!); });
ExpectNull(() => { _ = Index.has(null!); });
int evaluations = 0;
ExpectNull(() => { _ = Index.assign(null!, Supply(source)); });
if (evaluations != 1) throw new Exception("assignment arguments must evaluate once before receiver failure");
if (Index.keys(value)[0] != "value" || Index.values(value)[0] != "before" || Index.entries(value)[0].Item2 != "before" || !Index.has(value))
    throw new Exception("native normal projection values");
for (int iteration = 0; iteration < 8192; iteration++) { _ = Index.assign(value, source); value.value = source.value; }
long before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 4096; iteration++) {
    if (!ReferenceEquals(Index.assign(value, source), value)) throw new Exception("receiver copied");
}
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 4096; iteration++) value.value = source.value;
long native = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != native || native != 0 || value.value != "after") throw new Exception($"native allocation {generated} != {native}");
Console.Write("0:0");
T Supply<T>(T result) { evaluations++; return result; }
static void ExpectNull(Action action) {
    try { action(); } catch (NullReferenceException) { return; }
    throw new Exception("native reference receiver did not fail");
}
`);
  assert.equal(output, "0:0", "null safety preserves native failure and evaluation without adding normal-path allocation");
});
