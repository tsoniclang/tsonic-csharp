import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { freshArraySpreadSource, freshArraySpreadJsSource, freshArraySpreadCostSource, mutableArrayWideningSource } from "../../../../tsonic/test/fixtures/fresh-array-spread.mjs";

for (const surface of [undefined, "js"]) {
  test(`fresh dense spread uses exact element conversions on ${surface ?? "native"} storage`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: surface === "js" ? freshArraySpreadJsSource : freshArraySpreadSource });
    const source = [...compiled.artifacts].filter(([path]) => path.endsWith("Index.cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(source, /ArrayHelpers\.Concat|Array\.concat|\.Select\(|\.ToArray\(|Func</);
    executeCsharpConstruction(compiled, `fresh-array-spread-${surface ?? "native"}`);
  });

  test(`mutable array widening stays rejected on ${surface ?? "native"} storage`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: mutableArrayWideningSource });
    assertCsharpCheckingSucceeded(compiled);
    assert.ok(compiled.result.diagnostics.length > 0);
    assert.equal(compiled.artifacts.size, 0);
  });
}

test("fresh numeric spread allocates only its destination, matching handwritten native loops", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: freshArraySpreadCostSource });
  executeCsharpConstruction(compiled, "fresh-array-spread-cost", false, false, [], `
using System;
using System.Collections.Generic;
using Index = Tsonic.Generated.Index;
foreach (int length in new[] { 1, 2, 10, 128 }) {
    byte[] input = new byte[length];
    Array.Fill(input, (byte)7);
    for (int index = 0; index < 1000; index++) {
        GC.KeepAlive(Index.widen(input));
        GC.KeepAlive(Handwritten(input));
    }
    long before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) {
        double[] output = Index.widen(input);
        if (output.Length != length || output[0] != 7 || output[length - 1] != 7) throw new Exception("generated spread value");
        GC.KeepAlive(output);
    }
    long generated = GC.GetAllocatedBytesForCurrentThread() - before;
    before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) GC.KeepAlive(Handwritten(input));
    long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
    if (generated != handwritten) throw new Exception($"spread allocation: {generated} != {handwritten}");
    byte[] copied = Index.copy(input);
    copied[0] = 9;
    if (copied.Length != length || input[0] != 7) throw new Exception("native copy identity");
    byte[] readonlyInput = input;
    for (int index = 0; index < 1000; index++) {
        GC.KeepAlive(Index.widenReadonly(readonlyInput));
        GC.KeepAlive(HandwrittenReadonly(readonlyInput));
    }
    before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) {
        double[] output = Index.widenReadonly(readonlyInput);
        if (output.Length != length || output[0] != 7 || output[length - 1] != 7) throw new Exception("readonly spread value");
        GC.KeepAlive(output);
    }
    generated = GC.GetAllocatedBytesForCurrentThread() - before;
    before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) GC.KeepAlive(HandwrittenReadonly(readonlyInput));
    handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
    if (generated != handwritten) throw new Exception($"readonly allocation: {generated} != {handwritten}");
}
IReadOnlyList<double> literal = Index.readonlyValues();
if (literal.Count != 2 || literal[0] != 1 || literal[1] != 2) throw new Exception("readonly literal value");
static double[] Handwritten(byte[] source) {
    double[] result = new double[source.Length];
    for (int index = 0; index < source.Length; index++) result[index] = source[index];
    return result;
}
static double[] HandwrittenReadonly(byte[] source) {
    double[] result = new double[source.Length];
    for (int index = 0; index < source.Length; index++) result[index] = source[index];
    return result;
}
`);
});
