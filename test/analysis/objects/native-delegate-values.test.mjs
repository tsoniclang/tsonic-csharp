import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`closed native delegates retain their original value through unknown (${surface})`, { timeout: 300_000 }, () => {
    const sourceText = `
import type { int32 } from "@tsonic/core/types.js";
interface Counter { total: int32 }
export function boxed(value: (input: int32) => int32): unknown { return value; }
export function typed(value: unknown): (input: int32) => int32 { return value as (input: int32) => int32; }
export function kind(value: unknown): string { return typeof value; }
export function run(): boolean {
  const counter: Counter = { total: 0 };
  const original: (input: int32) => int32 = (input: int32): int32 => {
    counter.total += input;
    return counter.total;
  };
  const value: unknown = original;
  const repeated = value as (input: int32) => int32;
  const other: (input: int32) => int32 = (input: int32): int32 => input;
  const otherValue: unknown = other;
  return typeof value === "function" && original === repeated && value !== otherValue &&
    repeated(7) === 7 && counter.total === 7;
}
`;
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /new\s+(?:global::)?Tsonic\.CSharp\.Runtime\.TsFunction|DynamicInvoke|System\.Reflection|DispatchProxy/u,
      "a closed native delegate never receives an invocation adapter or reflection path");
    const native = executeCsharpConstruction(compiled, `native-delegate-value-${surface}`, false, false, [], `
using System;
using Subject = Tsonic.Generated.Index;
if (!Subject.run()) throw new Exception("native captured receiver/value identity");
Func<int, int> original = value => value + 1;
var boxed = Subject.boxed(original);
if (!ReferenceEquals(boxed.unwrap(), original) || !ReferenceEquals(Subject.typed(boxed), original) ||
    Subject.kind(boxed) != "function" || Subject.typed(boxed)(7) != 8)
    throw new Exception("exact native closed delegate boundary");
for (var index = 0; index < 16384; index++) {
    var value = Subject.boxed(original);
    _ = Subject.typed(value);
    _ = Subject.kind(value);
}
var matches = 0;
var before = GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 16384; index++) {
    var value = Subject.boxed(original);
    if (ReferenceEquals(Subject.typed(value), original) && Subject.kind(value) == "function") matches++;
}
var selectedBytes = GC.GetAllocatedBytesForCurrentThread() - before;
var nativeMatches = 0;
before = GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 16384; index++) if (ReferenceEquals(original, original)) nativeMatches++;
var nativeBytes = GC.GetAllocatedBytesForCurrentThread() - before;
if (matches != 16384 || matches != nativeMatches || nativeBytes != 0 || selectedBytes != nativeBytes)
    throw new Exception($"delegate value allocation:{matches}:{selectedBytes}:{nativeBytes}");
Console.WriteLine("native-delegate-value:True:0:0");
`);
    assert.match(native, /native-delegate-value:True:0:0/u,
      "the original native delegate and captured receiver cross the exact unknown boundary without allocation");
  });
}
