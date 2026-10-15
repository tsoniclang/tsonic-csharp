import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

test("direct C# translation initializes undefined storage and closes recursive local callables", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export function choose(flag: boolean): string | undefined {
        let value: string | undefined;
        if (flag) value = "yes";
        return value;
      }
      export function walk(values: string[]): number {
        let count = 0;
        const visit = (index: number): void => {
          if (index >= values.Length) return;
          count++;
          visit(index + 1);
        };
        visit(0);
        return count;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string? choose(bool flag)
        {
            string? value = null;
            if (flag)
            {
                value = "yes";
            }
            return value;
        }
        public static double walk(string[] values)
        {
            ObjectShape_capture_ffef __tsonic_captures0 = new ObjectShape_capture_ffef
            {
                value0 = default(Action<double>)!,
                value1 = default(string[])!,
                value2 = default(double)!,
            };
            __tsonic_captures0.value1 = values;
            __tsonic_captures0.value2 = 0;
            __tsonic_captures0.value0 = __tsonic_captures0.invoke0;
            __tsonic_captures0.value0(0);
            return __tsonic_captures0.value2;
        }
    }
}
`);
  executeCsharpConstruction(compiled, "recursive-local-storage-cost", false, false, [], `
using Index = Tsonic.Generated.Index;
if (Index.choose(false) != null || Index.choose(true) != "yes") throw new System.Exception("native absence initialization");
var values = new string[8];
for (var warmup = 0; warmup < 10000; warmup++) {
    if (Index.walk(values) != 8 || Handwritten(values) != 8) throw new System.Exception("recursive local execution");
}
double generatedTotal = 0;
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) generatedTotal += Index.walk(values);
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
double nativeTotal = 0;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) nativeTotal += Handwritten(values);
var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generatedTotal != 80000 || nativeTotal != generatedTotal || generatedCost != nativeCost)
    throw new System.Exception($"recursive activation allocation {generatedCost} != {nativeCost}");
static double Handwritten(string[] values) {
    double count = 0;
    System.Action<double> visit = null!;
    visit = index => {
        if (index >= values.Length) return;
        count++;
        visit(index + 1);
    };
    visit(0);
    return count;
}
`);
});
