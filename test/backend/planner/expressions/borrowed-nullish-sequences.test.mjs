import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { borrowedNullishSequencesSource, incompatibleBorrowedSequenceSource, mutableBorrowedHeaderSource } from "../../../../../tsonic/test/fixtures/borrowed-nullish-sequences.mjs";
import { createTsonicPlugin } from "../../../../../csharp-nodejs/dist/index.js";

for (const surface of [undefined, "js"]) {
  test(`native nullish sequences retain backing until the authored snapshot (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, capabilities: [createTsonicPlugin()], sourceText: borrowedNullishSequencesSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /\.ToArray\(|\.Select\(|IEnumerable<|foreach|Func</u);
    assert.match(output, /Microsoft\.Extensions\.Primitives\.StringValues/u);
    assert.doesNotMatch(output, /IReadOnlyList<string>|Array\.Empty<string>\(\).*\?\?/u);
    const references = [fileURLToPath(new URL("../../../../../csharp-nodejs/csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj", import.meta.url))];
    const carrier = surface === "js" ? "Tsonic.CSharp.Js.JSArray<string>" : "string[]";
    const authored = surface === "js" ? 'new Tsonic.CSharp.Js.JSArray<string> { "authored", "second" }' : 'new string[] { "authored", "second" }';
    const count = surface === "js" ? "Count" : "Length";
    const hand = surface === "js"
      ? `var result = new Tsonic.CSharp.Js.JSArray<string>(); if (authored is not null) return result.AppendSequence(authored);
         if (native is { } source) { result.EnsureCapacity(source.Count); for (var index = 0; index < source.Count; index++) result.Add(source[index]!); } return result;`
      : `if (authored is not null) { var result = new string[authored.Length]; System.Array.Copy(authored, result, authored.Length); return result; }
         if (native is { } source) { var result = new string[source.Count]; for (var index = 0; index < source.Count; index++) result[index] = source[index]!; return result; } return new string[0];`;
    executeCsharpConstruction(compiled, `borrowed-nullish-sequences-${surface ?? "native"}`, false, false, references, `
using Index = Tsonic.Generated.Index;
${carrier} authored = ${authored};
string[] backing = new string[] { "native", "tail" };
var native = new Microsoft.Extensions.Primitives.StringValues(backing);
var first = Index.choose(authored, native);
if (first.${count} != 2 || first[0] != "authored") throw new System.Exception("present source selection");
first[0] = "changed";
if (authored[0] != "authored" || backing[0] != "native") throw new System.Exception("fresh destination alias");
var second = Index.choose(null, native);
if (second.${count} != 2 || second[0] != "native") throw new System.Exception("native fallback");
second[0] = "changed";
if (backing[0] != "native") throw new System.Exception("native backing alias");
if (Index.choose(null, null).${count} != 0) throw new System.Exception("absence fallback");
var lazy = Index.chooseLazy(authored, native, () => throw new System.Exception("eager fallback"));
if (lazy.${count} != 4 || lazy[0] != "before" || lazy[3] != "after") throw new System.Exception("mixed contribution order");
var calls = 0;
var fallback = Index.chooseLazy(null, null, () => { calls++; return ${surface === "js" ? 'new Tsonic.CSharp.Js.JSArray<string> { "fallback" }' : 'new string[] { "fallback" }'}; });
if (calls != 1 || fallback.${count} != 3 || fallback[1] != "fallback") throw new System.Exception("effectful fallback consumption");
for (var index = 0; index < 1000; index++) { System.GC.KeepAlive(Index.choose(authored, native)); System.GC.KeepAlive(Handwritten(authored, native)); }
foreach (var selected in new ${carrier}?[] { authored, null }) {
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 10000; index++) System.GC.KeepAlive(Index.choose(selected, native));
    var generated = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 10000; index++) System.GC.KeepAlive(Handwritten(selected, native));
    var handwritten = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (generated != handwritten) throw new System.Exception($"borrowed selection allocation: {generated} != {handwritten}");
}
static ${carrier} Handwritten(${carrier}? authored, Microsoft.Extensions.Primitives.StringValues? native) { ${hand} }
`);
  });
}

test("native sequence selection cannot admit incompatible element storage", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()], sourceText: incompatibleBorrowedSequenceSource });
  assert.notEqual(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.artifacts.length, 0);
});

test("borrowed native header values cannot promise a mutable source alias", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()], sourceText: mutableBorrowedHeaderSource });
  assert.notEqual(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.artifacts.length, 0);
});
