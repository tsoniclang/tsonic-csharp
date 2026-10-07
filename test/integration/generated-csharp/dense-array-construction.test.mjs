import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { denseArrayConstructionSource, denseArrayEvaluationSource } from "../../../../tsonic/test/fixtures/dense-array-construction.mjs";

for (const [name, sourceText] of [["storage", denseArrayConstructionSource], ["evaluation", denseArrayEvaluationSource]]) {
  test(`dense array construction preserves ${name} without temporary arrays`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    executeCsharpConstruction(compiled, `dense-array-${name}`, false, false, [], name === "storage" ? `
using System;
using Tsonic.CSharp.Js;
using Index = Tsonic.Generated.Index;
if (!Index.run()) throw new Exception("original dense storage contract");
foreach (int length in new[] { 0, 1, 2, 10, 128 }) {
    var integers = new JSArray<long>();
    var strings = new JSArray<string>();
    for (int index = 0; index < length; index++) {
        integers.Add(9007199254740993L);
        strings.Add(new string('x', 2));
    }
    Verify(integers);
    Verify(strings);
}
static void Verify<T>(JSArray<T> input) {
    var comparison = System.Collections.Generic.EqualityComparer<T>.Default;
    for (int index = 0; index < 1000; index++) {
        GC.KeepAlive(Index.copy(input));
        GC.KeepAlive(Handwritten(input));
    }
    long before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) {
        JSArray<T> result = Index.copy(input);
        if (ReferenceEquals(result, input) || result.Count != input.Count) throw new Exception("fresh exact dense storage");
        if (result.Count != 0 && (!comparison.Equals(result[0], input[0]) ||
            !comparison.Equals(result[^1], input[^1]))) throw new Exception("exact copied values");
        GC.KeepAlive(result);
    }
    long generated = GC.GetAllocatedBytesForCurrentThread() - before;
    before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) GC.KeepAlive(Handwritten(input));
    long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
    if (generated != handwritten) throw new Exception($"dense copy allocations: {generated} != {handwritten}");
}
static JSArray<T> Handwritten<T>(JSArray<T> input) {
    var result = new JSArray<T>();
    result.EnsureCapacity(input.Count);
    for (int index = 0; index < input.Count; index++) result.Add(input[index]);
    return result;
}
` : undefined);
    const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    const directAppends = [...generated.matchAll(/\b(?<destination>\w+)\.EnsureCapacity\(checked\(\k<destination>\.Count \+ (?<source>\w+)\.length\)\);\s*for \(int (?<index>\w+) = 0; \k<index> < \k<source>\.length; \k<index>\+\+\)\s*\{\s*\k<destination>\.Add\(\k<source>\[\k<index>\]\);\s*\}/gu)];
    assert.equal(directAppends.length, name === "storage" ? 3 : 4, "every sequence spread reserves and fills its exact destination without an adapter");
    assert.equal([...generated.matchAll(/\.EnsureCapacity\(/gu)].length, 4, "all spreads have a direct capacity reservation");
    assert.equal([...generated.matchAll(/new Tsonic\.CSharp\.Js\.JSArray<[^>]+>\(\)/gu)].length,
      3, "each spread literal owns one collection, including literals with multiple spreads");
    if (name === "storage") {
      assert.equal(/\b(?<destination>\w+)\.EnsureCapacity\(checked\(\k<destination>\.Count \+ 2\)\);\s*\k<destination>\.Add\((?<source>\w+)\.Item1\);\s*\k<destination>\.Add\(\k<source>\.Item2\);/u.test(generated),
        true, "tuple spread appends its exact stack fields directly");
    }
    assert.equal(/\bnew\s+[\w.<>]+\s*\[|\.(?:concat|ToArray|ToList|Select)\(|Array\.Copy\(|AppendSequence|\bFunc</u.test(generated),
      false, "spread construction must not allocate a temporary array, sequence adapter or delegate");
  });
}
