import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
  import type { int32 } from "@tsonic/core/types.js";
  function wrap<T>(value: T): Promise<T> {
    return new Promise<T>(resolve => resolve(value));
  }
  async function pass<T>(value: T): Promise<T> { return value; }
  function forwarded<T>(value: T): Promise<T> {
    return new Promise<T>(resolve => { const done = resolve; done(value); });
  }
  function either<T>(value: T, selected: boolean): Promise<T | int32> {
    return new Promise<T | int32>(resolve => {
      if (selected) resolve(value); else resolve(9 as int32);
    });
  }
  export async function constructorResult(value: Promise<int32>): Promise<int32> { return await wrap(value); }
  export async function bodyResult(value: Promise<int32>): Promise<int32> { return await pass(value); }
  export async function forwardedResult(value: Promise<int32>): Promise<int32> { return await forwarded(value); }
  export async function unionResult(value: Promise<int32>, selected: boolean): Promise<int32> { return await either(value, selected); }
  export async function declared<Value>(value: Value | Promise<Value>): Promise<Value> { return await value; }
  export async function discard<Value>(value: Value): Promise<void> { await value; }
  export async function discardCall<Value>(create: () => Value): Promise<void> { await create(); }
`;

const nativeProgram = `
var value = System.Threading.Tasks.Task.FromResult(7);
if (await Tsonic.Generated.Index.constructorResult(value) != 7 ||
    await Tsonic.Generated.Index.bodyResult(value) != 7 ||
    await Tsonic.Generated.Index.forwardedResult(value) != 7 ||
    await Tsonic.Generated.Index.unionResult(value, true) != 7 ||
    await Tsonic.Generated.Index.unionResult(value, false) != 9)
    throw new System.Exception("declared generic Promise completion");
var ordinary = Tsonic.CSharp.Runtime.Union<System.Threading.Tasks.Task<int>, int>.From2(11);
var asynchronous = Tsonic.CSharp.Runtime.Union<System.Threading.Tasks.Task<int>, int>.From1(value);
if (await Tsonic.Generated.Index.declared<int>(ordinary) != 11 ||
    await Tsonic.Generated.Index.declared<int>(asynchronous) != 7)
    throw new System.Exception("declared generic union completion");
await Tsonic.Generated.Index.discard<int>(12);
var pending = new System.Threading.Tasks.TaskCompletionSource<int>(System.Threading.Tasks.TaskCreationOptions.RunContinuationsAsynchronously);
var observed = Tsonic.Generated.Index.discard<System.Threading.Tasks.Task<int>>(pending.Task);
if (observed.IsCompleted) throw new System.Exception("discard lost its pending native Task");
pending.SetResult(13);
await observed;
var calls = 0;
await Tsonic.Generated.Index.discardCall<System.Threading.Tasks.Task<int>>(() => { calls++; return value; });
if (calls != 1) throw new System.Exception("discard evaluated its original operand more than once");
var error = new System.InvalidOperationException("native retained identity");
try {
    await Tsonic.Generated.Index.constructorResult(System.Threading.Tasks.Task.FromException<int>(error));
    throw new System.Exception("Unwrap lost the original native failure");
} catch (System.InvalidOperationException caught) {
    if (!object.ReferenceEquals(caught, error)) throw new System.Exception("Unwrap changed failure identity");
}
try {
    await Tsonic.Generated.Index.discard<System.Threading.Tasks.Task<int>>(System.Threading.Tasks.Task.FromException<int>(error));
    throw new System.Exception("discard lost the original native failure");
} catch (System.InvalidOperationException caught) {
    if (!object.ReferenceEquals(caught, error)) throw new System.Exception("discard changed failure identity");
}
using var cancellation = new System.Threading.CancellationTokenSource();
cancellation.Cancel();
try {
    await Tsonic.Generated.Index.discard<System.Threading.Tasks.Task<int>>(System.Threading.Tasks.Task.FromCanceled<int>(cancellation.Token));
    throw new System.Exception("discard lost native cancellation");
} catch (System.OperationCanceledException caught) {
    if (caught.CancellationToken != cancellation.Token) throw new System.Exception("discard changed the native cancellation token");
}
`;

for (const surface of [undefined, "js"]) {
  test(`declared generic Promise calls and discarded awaits keep native values and safety on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /TaskExtensions\.Unwrap/u);
    assert.match(source, /switch/u);
    assert.match(source, /\bis\s+(?:global::)?System\.Threading\.Tasks\.Task\s+__tsonic_await_task_/u);
    assert.doesNotMatch(source, /ContinueWith|Task\.Run|\.Wait\(|\.Result\b/u);
    executeCsharpConstruction(compiled, `generic-await-completions-${surface ?? "native"}`, false, false, [], nativeProgram);
  });
}
