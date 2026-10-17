import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
const globalKey = "value";
const numericKey = 1;
enum Key { Value = 1 }
interface Holder { value: number; }
interface NumericHolder { 1: number; }
export function make(value: number): Holder { return { value }; }
export function makeNumeric(value: number): NumericHolder { return { 1: value }; }
export function globalRead(object: Holder): number { return object[globalKey]; }
export function localRead(object: Holder, key: "value"): number { return object[key]; }
export function numericRead(object: NumericHolder): number { return object[numericKey]; }
export function enumRead(object: NumericHolder): number { return object[Key.Value]; }
export function consumeGlobal(): string { return globalKey; }
class Effects {
  sequence: number = 0;
  receiver(value: number): Holder { this.sequence = this.sequence * 10 + 1; return { value }; }
  key(): "value" { this.sequence = this.sequence * 10 + 2; return "value"; }
  get field(): "value" { this.sequence = this.sequence * 10 + 3; return "value"; }
}
export function effectObservations(): boolean {
  const state = new Effects();
  const first = state.receiver(23)[state.key()];
  const second = state.receiver(24)[state.field];
  return first === 23 && second === 24 && state.sequence === 1213;
}
`;

const nativeProgram = `
string key = new string("value".ToCharArray());
var input = Tsonic.Generated.Index.make(23);
var numericInput = Tsonic.Generated.Index.makeNumeric(23);
var nativeInput = new NativeHolder(23);
for (int index = 0; index < 4096; index++) {
    _ = Tsonic.Generated.Index.globalRead(input);
    _ = Tsonic.Generated.Index.localRead(input, key);
    _ = Tsonic.Generated.Index.numericRead(numericInput);
    _ = Tsonic.Generated.Index.enumRead(numericInput);
    _ = Tsonic.Generated.Index.consumeGlobal();
    _ = NativeRead(nativeInput, key);
}
long actualBefore = System.GC.GetTotalAllocatedBytes(true);
double actual = 0;
for (int index = 0; index < 4096; index++) {
    actual += Tsonic.Generated.Index.globalRead(input) + Tsonic.Generated.Index.localRead(input, key) +
        Tsonic.Generated.Index.numericRead(numericInput) + Tsonic.Generated.Index.enumRead(numericInput);
}
long actualBytes = System.GC.GetTotalAllocatedBytes(true) - actualBefore;
long expectedBefore = System.GC.GetTotalAllocatedBytes(true);
double expected = 0;
for (int index = 0; index < 4096; index++) expected += NativeRead(nativeInput, "value") + NativeRead(nativeInput, key) + NativeRead(nativeInput, key) + NativeRead(nativeInput, key);
long expectedBytes = System.GC.GetTotalAllocatedBytes(true) - expectedBefore;
if (actual != expected || actual != 4096 * 4 * 23 || actualBytes != expectedBytes || actualBytes != 0)
    throw new System.Exception($"computed key cost actual={actualBytes}, native={expectedBytes}, values={actual}/{expected}");
long consumingBefore = System.GC.GetTotalAllocatedBytes(true);
string owned = Tsonic.Generated.Index.consumeGlobal();
long consumingBytes = System.GC.GetTotalAllocatedBytes(true) - consumingBefore;
if (owned != "value" || consumingBytes != 0 || Tsonic.Generated.Index.effectObservations() != NativeEffects.Observe() || !NativeEffects.Observe() || key != "value")
    throw new System.Exception("native immutable string identity, effects or consuming inverse");
System.Console.Write("computed key costs: native-equivalent");
static double NativeRead(NativeHolder holder, string key) {
    _ = key;
    return holder.Value;
}
readonly record struct NativeHolder(double Value);
sealed class NativeEffects {
    private int sequence;
    private NativeHolder Receiver(double value) { sequence = sequence * 10 + 1; return new NativeHolder(value); }
    private string Key(int digit) { sequence = sequence * 10 + digit; return "value"; }
    public static bool Observe() {
        var state = new NativeEffects();
        NativeHolder first = state.Receiver(23);
        _ = state.Key(2);
        NativeHolder second = state.Receiver(24);
        _ = state.Key(3);
        return first.Value == 23 && second.Value == 24 && state.sequence == 1213;
    }
}
`;

for (const surface of [undefined, "js"]) {
  test(`C# ${surface ?? "native"} computed keys retain physical views, effects and native costs`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true, "actual source reaches sealed native planning");
    const observed = executeCsharpConstruction(compiled, `computed-key-costs-${surface ?? "native"}`,
      false, false, [], nativeProgram);
    assert.equal(observed.trim(), "computed key costs: native-equivalent", "managed immutable string reads need no Rust owned/view conversion");
  });
}

