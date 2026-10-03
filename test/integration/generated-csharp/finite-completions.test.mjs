import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { finiteCompletionsSource } from "../../helpers/finite-completions.mjs";

const nativeProgram = `
static async System.Threading.Tasks.Task<int> NativeCompleted(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>> value) {
    if (value.Is1()) return value.As1();
    return await value.As2();
}
var synchronous = Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>>.From1(1234);
var task = System.Threading.Tasks.Task.FromResult(1234);
var asynchronous = Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>>.From2(task);
if (await Tsonic.Generated.Index.completed(synchronous) != 1234 ||
    await Tsonic.Generated.Index.completed(asynchronous) != 1234)
    throw new System.Exception("finite completion result");
var retained = Tsonic.Generated.Index.retain(() => task);
if (!object.ReferenceEquals(retained().As2(), task)) throw new System.Exception("Task identity changed");
if (await Tsonic.Generated.Index.optional(null) != null ||
    await Tsonic.Generated.Index.optional(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int?>>.From1(1234)) != 1234 ||
    await Tsonic.Generated.Index.optional(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int?>>.From2(System.Threading.Tasks.Task.FromResult<int?>(null))) != null)
    throw new System.Exception("optional finite completion");
await Tsonic.Generated.Index.discard(null);
await Tsonic.Generated.Index.discard(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>, System.Threading.Tasks.Task>.From1(1234));
await Tsonic.Generated.Index.discard(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>, System.Threading.Tasks.Task>.From2(task));
await Tsonic.Generated.Index.discard(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>, System.Threading.Tasks.Task>.From3(System.Threading.Tasks.Task.CompletedTask));
var pending = new System.Threading.Tasks.TaskCompletionSource<int>(System.Threading.Tasks.TaskCreationOptions.RunContinuationsAsynchronously);
var completion = Tsonic.Generated.Index.completed(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>>.From2(pending.Task));
if (completion.IsCompleted) throw new System.Exception("pending Task completed prematurely");
pending.SetResult(5678);
if (await completion != 5678) throw new System.Exception("pending Task result");
var pendingVoid = new System.Threading.Tasks.TaskCompletionSource(System.Threading.Tasks.TaskCreationOptions.RunContinuationsAsynchronously);
var voidCompletion = Tsonic.Generated.Index.discard(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>, System.Threading.Tasks.Task>.From3(pendingVoid.Task));
if (voidCompletion.IsCompleted) throw new System.Exception("void Task completed prematurely");
pendingVoid.SetResult();
await voidCompletion;
var failure = new System.InvalidOperationException("retained failure");
try {
    await Tsonic.Generated.Index.completed(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>>.From2(System.Threading.Tasks.Task.FromException<int>(failure)));
    throw new System.Exception("native failure was ignored");
} catch (System.InvalidOperationException actual) {
    if (!object.ReferenceEquals(actual, failure)) throw new System.Exception("failure identity changed");
}
try {
    await Tsonic.Generated.Index.discard(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>, System.Threading.Tasks.Task>.From3(System.Threading.Tasks.Task.FromException(failure)));
    throw new System.Exception("void failure was ignored");
} catch (System.InvalidOperationException actual) {
    if (!object.ReferenceEquals(actual, failure)) throw new System.Exception("void failure identity changed");
}
var cancellation = new System.Threading.CancellationToken(true);
try {
    await Tsonic.Generated.Index.completed(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>>.From2(System.Threading.Tasks.Task.FromCanceled<int>(cancellation)));
    throw new System.Exception("native cancellation was ignored");
} catch (System.OperationCanceledException actual) {
    if (actual.CancellationToken != cancellation) throw new System.Exception("native cancellation token changed");
}
for (var index = 0; index < 100; index++) {
    await Tsonic.Generated.Index.completed(asynchronous);
    await NativeCompleted(asynchronous);
    await Tsonic.Generated.Index.discard(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>, System.Threading.Tasks.Task>.From2(task));
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (await Tsonic.Generated.Index.completed(asynchronous) != 1234) throw new System.Exception("generated allocation control result");
}
var generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (await NativeCompleted(asynchronous) != 1234) throw new System.Exception("native allocation control result");
}
var nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generatedBytes != nativeBytes) throw new System.Exception($"completion allocation mismatch: generated={generatedBytes} native={nativeBytes}");
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    await Tsonic.Generated.Index.discard(Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task<int>, System.Threading.Tasks.Task>.From2(task));
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("discard introduced allocation");
`;

for (const surface of [undefined, "js"]) {
  test(`finite native completions preserve values, identity, cancellation and cost on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: finiteCompletionsSource });
    const source = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(source, /ContinueWith|Task\.Run|Task\.FromResult|\.Wait\(|\.Result\b/u);
    executeCsharpConstruction(compiled, "finite-completions", false, false, [], nativeProgram);
  });
}
