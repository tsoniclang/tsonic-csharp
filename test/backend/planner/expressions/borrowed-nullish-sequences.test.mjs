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
         if (native is { } source) { result.EnsureCapacity(source.Count); for (var index = 0; index < source.Count; index++) result.Add(Tsonic.CSharp.Node.Http.HeaderValues.read(source, index)); } return result;`
      : `if (authored is not null) { var result = new string[authored.Length]; System.Array.Copy(authored, result, authored.Length); return result; }
         if (native is { } source) { var result = new string[source.Count]; for (var index = 0; index < source.Count; index++) result[index] = Tsonic.CSharp.Node.Http.HeaderValues.read(source, index); return result; } return new string[0];`;
    const handHeaders = surface === "js"
      ? `var result = new Tsonic.CSharp.Js.JSArray<string>(); if (authored is not null) return result.AppendSequence(authored);
         if (headers[key] is { } values) { result.EnsureCapacity(values.Count);
             for (var index = 0; index < values.Count; index++) result.Add(HeaderValues.read(values, index)); } return result;`
      : `if (authored is not null) { var result = new string[authored.Length]; System.Array.Copy(authored, result, authored.Length); return result; }
         if (headers[key] is { } values) { var result = new string[values.Count];
             for (var index = 0; index < values.Count; index++) result[index] = HeaderValues.read(values, index); return result; } return new string[0];`;
    executeCsharpConstruction(compiled, `borrowed-nullish-sequences-${surface ?? "native"}`, false, false, references, `
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Tsonic.CSharp.Node.Http;
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
string?[] headerBacking = new string?[] { "header", "tail" };
var dictionary = new HeaderDictionary { ["x-item"] = new StringValues(headerBacking), ["empty"] = StringValues.Empty };
var headers = new IncomingHttpHeaders(dictionary);
var nativeHeaderSnapshot = Index.chooseFromHeaders(null, headers, "X-ITEM");
if (nativeHeaderSnapshot.${count} != 2 || nativeHeaderSnapshot[0] != "header") throw new System.Exception("actual native header selection");
var directHeaderSnapshot = Index.snapshotFromHeaders(headers, "x-item");
if (directHeaderSnapshot.${count} != 2 || directHeaderSnapshot[1] != "tail") throw new System.Exception("actual native header snapshot");
headerBacking[0] = "live";
if (Index.firstFromHeaders(headers, "x-item") != "live" || Index.joinFromHeaders(headers, "x-item") != "livetail") throw new System.Exception("actual indexed and foreach reads retain live backing");
if (Index.firstFromHeaderHolder(headers, "x-item") != "live" || Index.guardedFirstFromHeaderHolder(headers, "x-item") != "live") throw new System.Exception("nested native header selection retains present payload and live backing");
if (nativeHeaderSnapshot[0] != "header" || directHeaderSnapshot[0] != "header") throw new System.Exception("actual header snapshot retains independent storage");
nativeHeaderSnapshot[1] = "changed";
if (headerBacking[1] != "tail") throw new System.Exception("actual header snapshot does not mutate provider backing");
foreach (var key in new[] { "missing", "empty" }) {
    if (Index.chooseFromHeaders(null, headers, key).${count} != 0 || Index.snapshotFromHeaders(headers, key).${count} != 0 ||
        Index.firstFromHeaders(headers, key) is not null || Index.joinFromHeaders(headers, key) != "") throw new System.Exception("actual header native absence");
    if (Index.firstFromHeaderHolder(headers, key) is not null || Index.guardedFirstFromHeaderHolder(headers, key) is not null) throw new System.Exception("nested native header selection preserves absence");
}
if (Index.chooseFromHeaders(authored, headers, "bad header")[0] != "authored") throw new System.Exception("header operand is lazy when source is present");
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
for (var index = 0; index < 1000; index++) { System.GC.KeepAlive(Index.chooseFromHeaders(null, headers, "x-item")); System.GC.KeepAlive(HandwrittenHeaders(null, headers, "x-item")); }
foreach (var selected in new ${carrier}?[] { authored, null }) {
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 10000; index++) System.GC.KeepAlive(Index.chooseFromHeaders(selected, headers, "x-item"));
    var generated = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 10000; index++) System.GC.KeepAlive(HandwrittenHeaders(selected, headers, "x-item"));
    var handwritten = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (generated != handwritten) throw new System.Exception($"actual header selection allocation: {generated} != {handwritten}");
}
headerBacking[1] = null;
if (Index.firstFromHeaders(headers, "x-item") != "live" || Index.chooseFromHeaders(authored, headers, "x-item")[0] != "authored") throw new System.Exception("header null check must not pre-scan an unused payload");
if (Index.firstFromHeaderHolder(headers, "x-item") != "live" || Index.guardedFirstFromHeaderHolder(headers, "x-item") != "live") throw new System.Exception("nested native header selection must not copy or pre-scan unused payloads");
ExpectAbsentPayloadRejected(() => { Index.chooseFromHeaders(null, headers, "x-item"); });
ExpectAbsentPayloadRejected(() => { Index.snapshotFromHeaders(headers, "x-item"); });
ExpectAbsentPayloadRejected(() => { Index.joinFromHeaders(headers, "x-item"); });
headerBacking[0] = null;
ExpectAbsentPayloadRejected(() => { Index.firstFromHeaders(headers, "x-item"); });
ExpectAbsentPayloadRejected(() => { Index.firstFromHeaderHolder(headers, "x-item"); });
ExpectAbsentPayloadRejected(() => { Index.guardedFirstFromHeaderHolder(headers, "x-item"); });
static ${carrier} Handwritten(${carrier}? authored, Microsoft.Extensions.Primitives.StringValues? native) { ${hand} }
static ${carrier} HandwrittenHeaders(${carrier}? authored, IncomingHttpHeaders headers, string key) { ${handHeaders} }
static void ExpectAbsentPayloadRejected(System.Action action) {
    try { action(); } catch (System.InvalidOperationException) { return; }
    throw new System.Exception("native header physical absence must be rejected at the actual read");
}
`, "Tsonic.CSharp.Node.Tests");
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

test("native construction assembly identity rejects malformed selections before creating a project", () => {
  for (const assemblyName of [null, 0, "", "../test", "name/child", "name\\child", "name<child", "name&child", "$(Injected)", "name\nchild"]) {
    assert.throws(() => executeCsharpConstruction(undefined, "invalid-assembly", false, false, [], undefined, assemblyName),
      /Native construction assemblyName/u);
  }
});
