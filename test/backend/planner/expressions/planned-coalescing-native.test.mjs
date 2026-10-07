import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

const sourceText = `
import type { int32, uint64 } from "@tsonic/core/types.js";
type Completion = int32 | Promise<void> | undefined;
export class CoalescingRecord { value: int32 = 17; }
export class CoalescingSlot { value: int32 | undefined = undefined; }
export async function integer(left: () => int32 | undefined, pending: () => Completion): Promise<int32 | void | undefined> {
  return left() ?? await pending();
}
export async function wide(left: () => uint64 | undefined,
  pending: () => uint64 | Promise<void> | undefined): Promise<uint64 | void | undefined> {
  return left() ?? await pending();
}
export async function nested(left: () => int32 | undefined, middle: () => int32 | undefined,
  pending: () => Completion): Promise<int32 | void | undefined> {
  return left() ?? (middle() ?? await pending());
}
export async function assignment(owner: () => CoalescingSlot, pending: () => Completion): Promise<int32 | undefined> {
  return owner().value ??= ((await pending()) ?? (7 as int32));
}
export async function reference(left: () => CoalescingRecord | undefined, effect: () => void,
  pending: () => Promise<CoalescingRecord | undefined>): Promise<CoalescingRecord | undefined> {
  return left() ?? (effect(), await pending());
}
export async function text(left: () => string | undefined, effect: () => void,
  pending: () => Promise<string | undefined>): Promise<string | undefined> {
  return left() ?? (effect(), await pending());
}
export function expression(left: () => int32 | undefined, right: () => int32): int32 { return left() ?? right(); }
export function region(left: () => int32 | undefined, effect: () => void, right: () => int32): int32 {
  return left() ?? (effect(), right());
}
export function flag(left: () => boolean | undefined, effect: () => void, right: () => boolean): boolean {
  return left() ?? (effect(), right());
}
export function failing(left: () => int32 | undefined, failure: () => never): int32 { return left() ?? failure(); }
`;

const nativeProgram = `
static async System.Threading.Tasks.Task<int?> NativeInteger(System.Func<int?> left,
    System.Func<Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>?> pending) {
    var present = left();
    if (present.HasValue) return present;
    var completion = pending();
    if (!completion.HasValue) return null;
    if (completion.Value.Is1()) return completion.Value.As1();
    await completion.Value.As2();
    return null;
}
var calls = "";
int? Left(int? value) { calls += "L"; return value; }
Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>? Pending(int value) {
    calls += "P"; return Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From1(value);
}
if (await Tsonic.Generated.Index.integer(() => Left(0), () => Pending(42)) != 0 || calls != "L")
    throw new System.Exception("present zero invoked fallback");
calls = "";
if (await Tsonic.Generated.Index.integer(() => Left(null), () => Pending(42)) != 42 || calls != "LP")
    throw new System.Exception("absent integer lost fallback order or count");
calls = "";
if (await Tsonic.Generated.Index.wide(() => 9007199254740993UL,
    () => { calls += "P"; return Tsonic.CSharp.Runtime.Union<ulong, System.Threading.Tasks.Task>.From1(ulong.MaxValue); }) != 9007199254740993UL
    || calls != "") throw new System.Exception("present native width or lazy branch changed");
if (await Tsonic.Generated.Index.wide(() => null,
    () => { calls += "P"; return Tsonic.CSharp.Runtime.Union<ulong, System.Threading.Tasks.Task>.From1(ulong.MaxValue); }) != ulong.MaxValue
    || calls != "P") throw new System.Exception("selected fallback lost native integer domain");
calls = "";
if (await Tsonic.Generated.Index.nested(() => Left(0), () => { calls += "M"; return null; }, () => Pending(42)) != 0 || calls != "L")
    throw new System.Exception("outer coalescing eagerly observed inner branch");
calls = "";
if (await Tsonic.Generated.Index.nested(() => Left(null), () => { calls += "M"; return 0; }, () => Pending(42)) != 0 || calls != "LM")
    throw new System.Exception("inner present value eagerly observed fallback");
calls = "";
if (await Tsonic.Generated.Index.nested(() => Left(null), () => { calls += "M"; return null; }, () => Pending(42)) != 42 || calls != "LMP")
    throw new System.Exception("nested absence lost selected fallback");
var completion = new System.Threading.Tasks.TaskCompletionSource(System.Threading.Tasks.TaskCreationOptions.RunContinuationsAsynchronously);
calls = "";
var running = Tsonic.Generated.Index.integer(() => Left(null), () => {
    calls += "P"; return Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(completion.Task);
});
if (calls != "LP" || running.IsCompleted) throw new System.Exception("absent branch did not suspend once");
completion.SetResult();
if (await running != null || calls != "LP") throw new System.Exception("unit completion changed native absence");
var record = new Tsonic.Generated.CoalescingRecord();
calls = "";
if (!object.ReferenceEquals(await Tsonic.Generated.Index.reference(() => { calls += "L"; return record; },
    () => { calls += "E"; }, () => { calls += "P"; return System.Threading.Tasks.Task.FromResult<Tsonic.Generated.CoalescingRecord?>(null); }), record)
    || calls != "L") throw new System.Exception("present reference lost identity or invoked fallback");
calls = "";
if (!object.ReferenceEquals(await Tsonic.Generated.Index.reference(() => { calls += "L"; return null; },
    () => { calls += "E"; }, () => { calls += "P"; return System.Threading.Tasks.Task.FromResult<Tsonic.Generated.CoalescingRecord?>(record); }), record)
    || calls != "LEP") throw new System.Exception("reference fallback lost identity or ordered region");
calls = "";
if (await Tsonic.Generated.Index.text(() => { calls += "L"; return ""; }, () => { calls += "E"; },
    () => { calls += "P"; return System.Threading.Tasks.Task.FromResult<string?>("fallback"); }) != "" || calls != "L")
    throw new System.Exception("empty string was treated as absence");
calls = "";
if (Tsonic.Generated.Index.flag(() => { calls += "L"; return false; }, () => { calls += "E"; },
    () => { calls += "P"; return true; }) || calls != "L") throw new System.Exception("false was treated as absence");
calls = "";
if (Tsonic.Generated.Index.flag(() => { calls += "L"; return null; }, () => { calls += "E"; },
    () => { calls += "P"; return false; }) || calls != "LEP") throw new System.Exception("absent flag changed fallback order or value");
var originalFailure = new System.InvalidOperationException("original fallback");
Tsonic.CSharp.Runtime.Never Fail() { calls += "F"; throw originalFailure; }
calls = "";
if (Tsonic.Generated.Index.failing(() => Left(0), Fail) != 0 || calls != "L")
    throw new System.Exception("unselected nonreturning branch executed");
try { Tsonic.Generated.Index.failing(() => Left(null), Fail); throw new System.Exception("failure ignored"); }
catch (System.InvalidOperationException actual) {
    if (!object.ReferenceEquals(actual, originalFailure) || calls != "LLF") throw new System.Exception("failure identity or order changed");
}
try {
    await Tsonic.Generated.Index.integer(() => null,
        () => Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(System.Threading.Tasks.Task.FromException(originalFailure)));
    throw new System.Exception("awaited fallback failure ignored");
} catch (System.InvalidOperationException actual) {
    if (!object.ReferenceEquals(actual, originalFailure)) throw new System.Exception("awaited fallback failure identity changed");
}
using var cancellation = new System.Threading.CancellationTokenSource();
cancellation.Cancel();
try {
    await Tsonic.Generated.Index.integer(() => null,
        () => Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(System.Threading.Tasks.Task.FromCanceled(cancellation.Token)));
    throw new System.Exception("cancellation ignored");
} catch (System.OperationCanceledException actual) {
    if (actual.CancellationToken != cancellation.Token) throw new System.Exception("cancellation token changed");
}
foreach (var present in new int?[] { 0, null }) {
    var original = new Tsonic.Generated.CoalescingSlot { value = present };
    var replacement = new Tsonic.Generated.CoalescingSlot { value = 100 };
    var current = original;
    calls = "";
    var assigned = Tsonic.Generated.Index.assignment(() => { calls += "O"; return current; },
        () => { calls += "P"; current = replacement; return null; });
    var expected = present ?? 7;
    if (await assigned != expected || original.value != expected || replacement.value != 100 || calls != (present.HasValue ? "O" : "OP"))
        throw new System.Exception("coalescing assignment lost location, lazy fallback or effect count");
}
var suspendedOriginal = new Tsonic.Generated.CoalescingSlot();
var suspendedReplacement = new Tsonic.Generated.CoalescingSlot { value = 100 };
var suspendedCurrent = suspendedOriginal;
completion = new System.Threading.Tasks.TaskCompletionSource(System.Threading.Tasks.TaskCreationOptions.RunContinuationsAsynchronously);
calls = "";
running = Tsonic.Generated.Index.assignment(() => { calls += "O"; return suspendedCurrent; },
    () => { calls += "P"; suspendedOriginal.value = 50; suspendedCurrent = suspendedReplacement;
        return Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(completion.Task); });
if (running.IsCompleted || calls != "OP") throw new System.Exception("assignment suspension moved location acquisition");
completion.SetResult();
if (await running != 7 || suspendedOriginal.value != 7 || suspendedReplacement.value != 100 || calls != "OP")
    throw new System.Exception("assignment reacquired a changed location or retested overwritten presence");
System.Func<int?> presentValue = () => 44;
System.Func<int?> absentValue = () => null;
System.Func<int> fallbackValue = () => 55;
System.Action noEffect = () => { };
System.Func<Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>?> completedValue =
    () => Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From1(44);
for (var index = 0; index < 100; index++) {
    if (Tsonic.Generated.Index.expression(presentValue, fallbackValue) != 44
        || Tsonic.Generated.Index.region(absentValue, noEffect, fallbackValue) != 55) throw new System.Exception("coalescing warmup result");
    await Tsonic.Generated.Index.integer(absentValue, completedValue);
    await NativeInteger(absentValue, completedValue);
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (Tsonic.Generated.Index.expression(presentValue, fallbackValue) != 44
        || Tsonic.Generated.Index.region(absentValue, noEffect, fallbackValue) != 55) throw new System.Exception("coalescing native result");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("coalescing introduced hidden allocation");
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (await Tsonic.Generated.Index.integer(absentValue, completedValue) != 44) throw new System.Exception("generated completion result");
}
var generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (await NativeInteger(absentValue, completedValue) != 44) throw new System.Exception("native completion result");
}
if (generatedBytes != System.GC.GetAllocatedBytesForCurrentThread() - before)
    throw new System.Exception("coalescing completion exceeds handwritten native allocation");
`;

for (const surface of [undefined, "js"]) {
  test(`native coalescing regions preserve lazy values, locations, identity and cost on ${surface ?? "native"}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ sourceText, surface });
      assertCsharpCompilationSucceeded(compiled);
      const source = [...compiled.artifacts.values()].join("\n");
      assert.doesNotMatch(source, /ContinueWith|Task\.Run|Task\.FromResult|new (?:System\.)?Func|async .*=>/u);
      executeCsharpConstruction(compiled, `planned-coalescing-${surface ?? "native"}`, true, false, [], nativeProgram);
    });
}
