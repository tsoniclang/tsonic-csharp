import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`generic initializer-less absence uses its selected native witness on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      function absent<T>(input: T, flag: boolean): boolean {
        let value: T | undefined;
        if (flag) value = input;
        return value === undefined;
      }
      export function checkInt(flag: boolean): boolean { return absent<int>(7, flag); }
      export function checkString(flag: boolean): boolean { return absent<string>("value", flag); }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "native generic optional storage is checked source");
    assert.equal(compiled.targetDiagnostics.length, 0, "generic absence uses the one selected storage contract");
    const output = compiled.artifacts.get("src/Index.cs");
    assert.match(output, /\.From1\(null\)/u, "the optional-storage witness explicitly constructs its absent arm");
    assert.doesNotMatch(output, /\bvalue = default/u, "generic absence never guesses the storage's default tag");
    executeCsharpConstruction(compiled, `generic-local-absence-${surface}`, false, false, [], `
using Index = Tsonic.Generated.Index;
for (var warmup = 0; warmup < 1000; warmup++) {
    var flag = (warmup & 1) == 0;
    if (Index.checkInt(flag) != !flag || Index.checkString(flag) != !flag)
        throw new System.Exception("generic native absence witness");
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
var generated = 0;
for (var iteration = 0; iteration < 10000; iteration++) {
    var flag = (iteration & 1) == 0;
    if (Index.checkInt(flag)) generated++;
    if (Index.checkString(flag)) generated++;
}
var generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var native = 0;
for (var iteration = 0; iteration < 10000; iteration++) {
    var flag = (iteration & 1) == 0;
    int? number = null;
    string? text = null;
    if (flag) { number = 7; text = "value"; }
    if (number is null) native++;
    if (text is null) native++;
}
var nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != 10000 || generated != native || generatedBytes != nativeBytes)
    throw new System.Exception($"generic absence {generated}/{native}, allocation {generatedBytes}/{nativeBytes}");
`);
  });
}

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
            string? value = default(string?);
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

test("initializer-less native locals use definite assignment and retain captured storage", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function assigned(): number {
      let value: number;
      value = 7;
      return value;
    }
    export function captured(): number {
      let value: number;
      const read = (): number => value;
      value = 9;
      return read();
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "native definite assignment is valid checked source");
  assert.equal(compiled.extensionDiagnostics.length, 0, "native locals require no extra source annotation");
  assert.equal(compiled.targetDiagnostics.length, 0, "local and captured physical storage are admitted");
  assert.match(compiled.artifacts.get("src/Index.cs"), /double value;/u,
    "non-absence storage is declared without a fabricated absence initializer");
  executeCsharpConstruction(compiled, "native-uninitialized-locals", false, false, [], `
if (Tsonic.Generated.Index.assigned() != 7 || Tsonic.Generated.Index.captured() != 9)
    throw new System.Exception("native definite-assignment and capture controls");
`);
});
