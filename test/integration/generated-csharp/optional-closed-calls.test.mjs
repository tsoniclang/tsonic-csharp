import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("closed native optional calls skip the complete region and evaluate once", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
export function direct(value: any, argument: () => any): any { return value?.create(argument()); }
export function chain(value: any, argument: () => any): any { return value?.create(argument()).finish(argument()); }
export function indexed(value: any, key: () => string, argument: () => any): any { return value?.[key()](argument()).finish(argument()); }
export function invoke(value: any, argument: () => any): any { return value?.(argument()).finish(argument()); }
` });
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /is Tsonic\.CSharp\.Runtime\.TsValue/);
  assert.equal(/!__tsonic_present_\w+\.isUndefined\(\)/u.test(output), true,
    "the exact selected native presence guard excludes absence");
  executeCsharpConstruction(compiled, "optional-closed-native-calls", false, false, [], `
using System;
using Tsonic.CSharp.Runtime;
using Index = Tsonic.Generated.Index;
int arguments = 0;
int keys = 0;
int calls = 0;
TsValue Argument() { arguments++; return TsValue.from(7); }
string Key() { keys++; return "create"; }
TsObject inner = new TsObject();
inner.WriteDynamicSlot("finish", new TsFunction(values => { calls++; return values[0]; }));
TsObject outer = new TsObject();
outer.WriteDynamicSlot("create", new TsFunction(values => { calls++; return TsValue.from(inner); }));
foreach (TsValue absent in new[] { default(TsValue), TsValue.from(null) }) {
    if (!Index.direct(absent, Argument).isUndefined()) throw new Exception("direct absence");
    if (!Index.chain(absent, Argument).isUndefined()) throw new Exception("chain absence");
    if (!Index.indexed(absent, Key, Argument).isUndefined()) throw new Exception("indexed absence");
    if (!Index.invoke(absent, Argument).isUndefined()) throw new Exception("callee absence");
}
if (arguments != 0 || calls != 0 || keys != 0) throw new Exception("absent optional evaluation");
TsValue present = TsValue.from(outer);
GC.KeepAlive(Index.direct(present, Argument));
if (!Equals(Index.chain(present, Argument).unwrap(), 7)) throw new Exception("chain value");
if (!Equals(Index.indexed(present, Key, Argument).unwrap(), 7)) throw new Exception("indexed value");
if (arguments != 5 || calls != 5 || keys != 1) throw new Exception("present optional evaluation");
TsValue function = TsValue.from(new TsFunction(values => { calls++; return TsValue.from(inner); }));
if (!Equals(Index.invoke(function, Argument).unwrap(), 7)) throw new Exception("callee chain value");
if (arguments != 7 || calls != 7 || keys != 1) throw new Exception("callee optional evaluation");
TsValue nullResult = TsValue.from(new TsFunction(values => { calls++; return TsValue.from(null); }));
bool rejected = false;
try { GC.KeepAlive(Index.invoke(nullResult, Argument)); } catch (Tsonic.CSharp.Runtime.TypeError) { rejected = true; }
if (!rejected || calls != 8) throw new Exception("present call result must not short-circuit");
`);
});
