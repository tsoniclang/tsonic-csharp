import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
export function admit(value: Record<string, unknown>): unknown { return value; }
export function absent(value: Record<string, unknown> | null | undefined): unknown { return value; }
`;

const nativeProgram = `
var dictionary = new System.Collections.Generic.Dictionary<string, Tsonic.CSharp.Runtime.TsValue>();
dictionary["present"] = Tsonic.CSharp.Runtime.TsValue.from((ulong)1);
dictionary["absent"] = Tsonic.CSharp.Runtime.TsValue.undefined();
var first = Tsonic.Generated.Index.admit(dictionary);
var second = Tsonic.Generated.Index.admit(dictionary);
if (!object.ReferenceEquals(first.unwrap(), dictionary) || !object.ReferenceEquals(second.unwrap(), dictionary))
    throw new System.Exception("dictionary alias identity changed");
dictionary["present"] = Tsonic.CSharp.Runtime.TsValue.from(ulong.MaxValue);
if (first.ReadDynamicSlot("present").unwrap() is not ulong value || value != ulong.MaxValue)
    throw new System.Exception("dictionary mutation or uint64 precision lost");
first.WriteDynamicSlot("written", first.ReadDynamicSlot("present"));
if (dictionary["written"].unwrap() is not ulong written || written != ulong.MaxValue)
    throw new System.Exception("dictionary write did not retain exact native value");
if (!first.ReadDynamicSlot("absent").isUndefined() || !Tsonic.Generated.Index.absent(null).isUndefined())
    throw new System.Exception("native absence lost");
for (var index = 0; index < 1000; index++) Tsonic.Generated.Index.admit(dictionary).ReadDynamicSlot("present");
var before = System.GC.GetAllocatedBytesForCurrentThread();
var matches = 0;
for (var index = 0; index < 10000; index++) {
    var admitted = Tsonic.Generated.Index.admit(dictionary);
    if (object.ReferenceEquals(admitted.unwrap(), dictionary) && admitted.ReadDynamicSlotAs<ulong>("present") == ulong.MaxValue)
        matches++;
}
var allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (matches != 10000 || allocated != 0)
    throw new System.Exception($"record admission changed identity or cost: matches={matches} allocation={allocated}");
`;

for (const surface of [undefined, "js"]) {
  test(`native Record admission preserves the original dictionary, null and exact widths on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /Dictionary<string, Tsonic\.CSharp\.Runtime\.TsValue>/u);
    assert.doesNotMatch(source, /new .*Dictionary|\.ToDictionary\(|CreateDynamicObject|reflection/u);
    executeCsharpConstruction(compiled, "native-record-admission", false, false, [], nativeProgram);
  });
}

test("source Record JSON operations use the original exact dictionary on the JS surface", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
export function encode(value: Record<string, unknown>): string | undefined { return JSON.stringify(value); }
export function broad(value: unknown): string | undefined { return JSON.stringify(value); }
export function options(value: Record<string, unknown>): string { return new Intl.NumberFormat("en", value).format(1234); }
` });
  executeCsharpConstruction(compiled, "native-record-json", false, false, [], `
var record = new System.Collections.Generic.Dictionary<string, Tsonic.CSharp.Runtime.TsValue> {
    ["wide"] = Tsonic.CSharp.Runtime.TsValue.from(ulong.MaxValue),
    ["absent"] = Tsonic.CSharp.Runtime.TsValue.undefined(),
};
var expected = "{\\\"wide\\\":18446744073709551615,\\\"absent\\\":null}";
if (Tsonic.Generated.Index.encode(record) != expected ||
    Tsonic.Generated.Index.broad(Tsonic.CSharp.Runtime.TsValue.from(record)) != expected)
    throw new System.Exception("source JSON Record carrier changed exact values");
var options = new System.Collections.Generic.Dictionary<string, Tsonic.CSharp.Runtime.TsValue> {
    ["useGrouping"] = Tsonic.CSharp.Runtime.TsValue.from(false),
};
if (Tsonic.Generated.Index.options(options) != "1234") throw new System.Exception("source Intl Record options did not reach exact slots");
`);
});
