import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("eager callback boundaries preserve authored observed self ABI, recursion and escaped identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    export function saved(values: int[]): ((value: int) => int)[] {
      const retained: ((value: int) => int)[] = [];
      values.map(function original(value: int): int {
        const alias = original;
        retained.push(alias);
        if (alias !== original) throw new Error("self alias");
        return value === 0 ? 1 : original(value - 1) + 1;
      });
      return retained;
    }
    export function callsOnly(values: int[]): int[] {
      return values.map(function original(value: int): int {
        return value === 0 ? 1 : original(value - 1) + 1;
      });
    }
    export function genericCallsOnly<T>(values: T[]): T[] {
      return values.map(function original(value: T, index: int): T {
        return index === 0 ? value : original(value, index - 1);
      });
    }
    export function genericUnused<T>(values: T[]): T[] {
      let remaining: int = 1;
      return values.map(function original(): T {
        if (remaining > 0) { remaining--; return original(); }
        return values[0];
      });
    }
    export function callsOnlyFailed(values: int[], error: Error): void {
      values.map(function original(value: int): int {
        if (value === 0) throw error;
        return original(value - 1);
      });
    }
    export function nullableAlias(values: int[]): boolean {
      const mapper: ((value: int) => int) | null = (value: int): int => value;
      const alias = mapper;
      values.map(alias);
      return mapper === alias;
    }
    export function unionAlias(values: int[]): boolean {
      const mapper: ((value: int) => int) | string = (value: int): int => value;
      const alias = mapper;
      values.map(alias);
      return mapper === alias;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.equal(/Func<int, int> __tsonic_self_[^\n]*Value =/u.test(source), true, "authored self value ABI");
  assert.equal(/static int __tsonic_self_[^\n]*\(int value, int [^,]+, Tsonic\.CSharp\.Js\.JSArray<int> /u.test(source), true, "calls-only retains full selected ABI");
  executeCsharpConstruction(compiled, "eager-named-self", false, false, [], `
using Tsonic.CSharp.Js;
using Index = Tsonic.Generated.Index;
var input = JSArray<int>.of([2, 1]);
var first = Index.saved(input);
var second = Index.saved(input);
if (first.Count != 5 || second.Count != 5) throw new System.Exception("recursive retained self calls");
for (var position = 0; position < first.Count; position++) {
    if (!object.ReferenceEquals(first[0], first[position]) || object.ReferenceEquals(first[position], second[position])) throw new System.Exception("activation-specific fixed self identity");
}
if (first[0](3) != 4 || first.Count != 9 || second.Count != 5) throw new System.Exception("escaped self lifetime and retained activation");
var result = Index.callsOnly(input);
if (result[0] != 3 || result[1] != 2) throw new System.Exception("calls-only selected ABI");
if (!Index.nullableAlias(input) || !Index.unionAlias(input)) throw new System.Exception("absence/union callable identity");
var references = JSArray<string>.of(["left", "right"]);
var genericReferences = Index.genericCallsOnly(references);
var genericValues = Index.genericCallsOnly(input);
if (genericReferences[0] != "left" || genericReferences[1] != "right" || genericValues[0] != 2 || genericValues[1] != 1) throw new System.Exception("generic exact synthetic slots");
VerifyUnused(input);
VerifyUnused(references);
var error = new Tsonic.CSharp.Runtime.Error("original recursion");
try { Index.callsOnlyFailed(input, error); throw new System.Exception("expected recursive exception"); }
catch (Tsonic.CSharp.Runtime.Error actual) { if (!object.ReferenceEquals(actual, error)) throw new System.Exception("recursive exception identity"); }
for (var warmup = 0; warmup < 10000; warmup++) { Index.callsOnly(input); NativeCallsOnly(input); }
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(Index.callsOnly(input));
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(NativeCallsOnly(input));
var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generatedCost != nativeCost) throw new System.Exception($"calls-only recursion allocation {generatedCost} != {nativeCost}");
static JSArray<int> NativeCallsOnly(JSArray<int> values) {
    static int Original(int value, int index, JSArray<int> array) => value == 0 ? 1 : Original(value - 1, index, array) + 1;
    return values.map(Original);
}
static void VerifyUnused<T>(JSArray<T> values) {
    var result = Index.genericUnused(values);
    if (result.Count != values.Count || !System.Collections.Generic.EqualityComparer<T>.Default.Equals(result[0], values[0]) ||
        !System.Collections.Generic.EqualityComparer<T>.Default.Equals(result[1], values[0])) throw new System.Exception("unused generic/value/reference recursive slots");
    for (var warmup = 0; warmup < 10000; warmup++) { Index.genericUnused(values); NativeUnused(values); }
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(Index.genericUnused(values));
    var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(NativeUnused(values));
    var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (generatedCost != nativeCost) throw new System.Exception($"unused generic recursive allocation {generatedCost} != {nativeCost}");
}
static JSArray<T> NativeUnused<T>(JSArray<T> values) {
    var remaining = 1;
    T Original(T value = default!, int index = 0, JSArray<T> array = null!) {
        if (remaining > 0) { remaining--; return Original(); }
        return values[0];
    }
    return values.map(Original);
}
`);
});

test("synthetic callable slots cannot enable unsupported runtime arguments introspection", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    export function run(values: int[]): number[] {
      return values.map(function original(value: int): number {
        return value === 0 ? arguments.Length : original(0);
      });
    }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.deepEqual(compiled.result.diagnostics.map(diagnostic => diagnostic.code), ["CSHARP_UNSUPPORTED_AST"]);
  assert.equal(compiled.artifacts.size, 0, "unclosed runtime arguments cannot publish target artifacts");
});
