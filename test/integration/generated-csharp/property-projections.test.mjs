import test from "node:test";
import assert from "node:assert/strict";
import { nativePropertyProjectionSource, nativePropertyProjectionCostSource } from "../../../../tsonic/test/fixtures/native-property-projections.mjs";
import { assertCsharpCheckingSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

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
