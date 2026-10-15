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
