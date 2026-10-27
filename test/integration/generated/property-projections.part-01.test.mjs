import test from "node:test";
import assert from "node:assert/strict";
import { nativePropertyProjectionSource, nativePropertyProjectionCostSource } from "../../../../tsonic/test/fixtures/native-property-projections.mjs";
import { assertCsharpCheckingSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("completed own-property proofs execute exact numeric keys, reordered occurrences and accessors", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
export function run(): boolean {
  const first = { tail: "tail", 10: "ten", 2: "two", "01": "leading" };
  const second = { "01": "leading", tail: "tail", 2: "two", 10: "ten" };
  let backing = "value";
  let reads = 0;
  const accessed = {
    tail: "tail",
    get current(): string { reads += 1; return backing; },
    set current(next: string) { backing = next; },
  };
  const keys = Object.keys(first);
  const reordered = Object.keys(second);
  const values = Object.values(first);
  const entries = Object.entries(first);
  const accessorKeys = Object.keys(accessed);
  const accessorValues = Object.values(accessed);
  const accessorEntries = Object.entries(accessed);
  return keys.join(",") === "2,10,tail,01" && reordered.join(",") === "2,10,01,tail" &&
    values.join(",") === "two,ten,tail,leading" && entries[0][0] === "2" && entries[0][1] === "two" &&
    entries[3][0] === "01" && entries[3][1] === "leading" && accessorKeys.join(",") === "tail,current" &&
    accessorValues.join(",") === "tail,value" && accessorEntries[1][0] === "current" &&
    accessorEntries[1][1] === "value" && reads === 2 && Object.hasOwn(first, "tail") &&
    first.hasOwnProperty("01") && !Object.hasOwn(first, "missing");
}` }), "completed-own-property-orders");
});

for (const [name, body] of Array.from([
  ["wider producer", `
    const actual = { count: 7 as int32, extra: 11 as int32 };
    const view: View = actual;
    return describe(view) === "count,extra";`],
  ["prototype getter", `
    const value: View = new PrototypeOnly();
    return describe(value) === "";`],
]).slice(0, 2)) {
test(`own-property admission refuses a minimum structural view of a ${name}`, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    type View = { readonly count: int32 };
    class PrototypeOnly { get count(): int32 { return 7; } }
    function describe(value: View): string { return Object.keys(value).join(","); }
    export function run(): boolean { ${body} }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.targetDiagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
    issue.message.includes("exact own-property set")), true, `${name}: the owning admission refuses an unproved own set`);
  assert.equal(compiled.artifacts.size, 0, `${name}: no truncated or prototype-based own-property array is published`);
});
}

test("Object.assign refuses a structural source whose complete own set is wider than its view", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    type View = { readonly count: int32 };
    function copy(value: View): int32 {
      const target = { count: 0 as int32, extra: 0 as int32 };
      return Object.assign(target, value).extra;
    }
    export function run(): boolean {
      const actual = { count: 7 as int32, extra: 11 as int32 };
      const view: View = actual;
      return copy(view) === 11;
    }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.targetDiagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
    issue.message.includes("exact own-property set")), true, "assignment source admission cannot silently copy only count");
  assert.equal(compiled.artifacts.size, 0, "no artifact can leave extra unchanged after truncating an unproved source");
});

test("own-property admission includes closed covariant native implementations with wider storage", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    class BaseValue { marker: int32 = 1; }
    class DerivedValue extends BaseValue { derived: int32 = 2; }
    type Read<Value> = { readonly value: Value };
    function describe(value: Read<BaseValue>): string { return Object.keys(value).join(","); }
    export function run(): boolean {
      const exact: Read<BaseValue> = { value: new BaseValue() };
      const actual = { value: new DerivedValue(), extra: 7 as int32 };
      const narrowed: Read<DerivedValue> = actual;
      return describe(exact) === "value" && describe(narrowed) === "value,extra";
    }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.targetDiagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
    issue.message.includes("exact own-property set")), true, "native covariance cannot hide the wider admitted receiver");
  assert.equal(compiled.artifacts.size, 0, "no truncated key array is published for a covariant native receiver");
});

test("native property projections preserve selected generic inherited getters and exact failure identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativePropertyProjectionSource });
  executeCsharpConstruction(compiled, "property-projections");
});

test("native projection does not relax unrepresentable C# primitive generic constraints", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class Options<T extends boolean> {
      constructor(public readonly useGrouping: T) {}
    }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.targetDiagnostics.length, 1);
  assert.equal(compiled.targetDiagnostics[0].message,
    "The selected source constraint cannot be represented as an exact C# generic constraint.");
  assert.equal(compiled.artifacts.size, 0, "native constraints are not replaced by a weaker constraint");
});

test("selected native property reads add no allocation beyond handwritten required API values", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativePropertyProjectionCostSource });
  const output = executeCsharpConstruction(compiled, "property-projection-cost", false, false, [], `
using System;
using System.Runtime.CompilerServices;
using Tsonic.CSharp.Runtime;
using Index = Tsonic.Generated.Index;
var options = new Tsonic.Generated.Options();
if (Index.format(options) != "9007199254740993" || Handwritten(options) != "9007199254740993")
    throw new Exception("exact property projection value");
for (int iteration = 0; iteration < 1000; iteration++) {
    GC.KeepAlive(Index.format(options));
    GC.KeepAlive(Handwritten(options));
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 1000; iteration++) GC.KeepAlive(Index.format(options));
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 1000; iteration++) GC.KeepAlive(Handwritten(options));
long native = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != native) throw new Exception($"selected property allocation {generated} != {native}");
Console.WriteLine($"{generated}:{native}");
[MethodImpl(MethodImplOptions.NoInlining)]
static string Handwritten(Tsonic.Generated.Options options) =>
    Tsonic.CSharp.Js.Intl.formatInteger(9007199254740993L, TsValue.from("en"),
        TsValue.CreateDynamicObject("useGrouping", TsValue.from(options.useGrouping)));
`);
  assert.match(output, /^\d+:\d+\s*$/u);
});

test("closed and partially open generic own projections preserve exact receiver identity and field carriers", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    type Box<Value> = { value: Value };
    function assign<Value>(target: Box<Value>, source: Box<Value>): Box<Value> { return Object.assign(target, source); }
    function first<Value>(input: Box<Value>): Value { return Object.values(input)[0]; }
    function entry<Value>(input: Box<Value>): Value { return Object.entries(input)[0][1]; }
    export function run(): boolean {
      const integer: Box<int32> = { value: 1 as int32 };
      const other: Box<int32> = { value: 7 as int32 };
      const text: Box<string> = { value: "before" };
      const after: Box<string> = { value: "after" };
      const assigned = Object.assign(integer, other);
      const changed = assign(text, after);
      return assigned === integer && assigned.value === 7 && changed === text && text.value === "after" &&
        first(integer) === 7 && first(text) === "after" && entry(integer) === 7 && entry(text) === "after" &&
        Object.keys(integer)[0] === "value" && Object.keys(text)[0] === "value" &&
        Object.hasOwn(integer, "value") && Object.hasOwn(text, "value") && !Object.hasOwn(text, "missing");
    }
  ` });
  executeCsharpConstruction(compiled, "generic-native-own-projections");
});

test("exact closed Object.assign introduces no allocation or receiver copy", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    type Box<Value> = { value: Value };
    export function make(value: int32): Box<int32> { return { value }; }
    export function assign(target: Box<int32>, source: Box<int32>): Box<int32> { return Object.assign(target, source); }
    export function run(): boolean { const target = make(1 as int32); return assign(target, make(7 as int32)) === target && target.value === 7; }
  ` });
  const output = executeCsharpConstruction(compiled, "generic-native-assign-cost", false, false, [], `
using System;
using Index = Tsonic.Generated.Index;
var target = Index.make(1);
var source = Index.make(7);
if (!ReferenceEquals(Index.assign(target, source), target) || target.value != 7)
    throw new Exception("exact generic assign identity");
for (int iteration = 0; iteration < 8192; iteration++) {
    _ = Index.assign(target, source);
    target.value = source.value;
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 4096; iteration++) {
    if (!ReferenceEquals(Index.assign(target, source), target)) throw new Exception("receiver copy");
}
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 4096; iteration++) {
    target.value = source.value;
    if (!ReferenceEquals(target, target)) throw new Exception("native receiver identity");
}
long native = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != native || native != 0 || target.value != 7)
    throw new Exception($"generic native assignment allocation {generated} != {native}");
Console.WriteLine($"{generated}:{native}");
`);
  assert.match(output, /^0:0\s*$/u, "native assignment keeps the same handle and exact zero-allocation baseline");
});
