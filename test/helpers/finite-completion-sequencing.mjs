export const finiteCompletionSequencingSource = `
import type { int32 } from "@tsonic/core/types.js";
export type MixedCompletion = int32 | Promise<void> | undefined;
export async function ordered(
  first: () => int32,
  pending: () => MixedCompletion,
  last: () => int32,
  consume: (first: int32, completed: int32 | void | undefined, last: int32) => int32,
): Promise<int32> {
  return consume(first(), await pending(), last());
}
export async function conditional(
  enabled: boolean,
  pending: () => MixedCompletion,
  fallback: () => int32,
): Promise<int32 | void | undefined> {
  return enabled ? await pending() : fallback();
}
export async function lazyAnd(enabled: boolean, pending: () => MixedCompletion): Promise<boolean | int32 | void | undefined> {
  return enabled && await pending();
}
export async function lazyOr(enabled: boolean, pending: () => MixedCompletion): Promise<boolean | int32 | void | undefined> {
  return enabled || await pending();
}
export async function coalesce(present: int32 | undefined, pending: () => MixedCompletion): Promise<int32 | void | undefined> {
  return present ?? await pending();
}
export async function snapshot(pending: () => MixedCompletion): Promise<int32> {
  let current = 1 as int32;
  function mutate(): MixedCompletion { current = 2 as int32; return pending(); }
  function first(left: int32, ignored: int32 | void | undefined): int32 { return left; }
  return first(current, await mutate());
}
export async function loop(
  pending: () => MixedCompletion,
  effect: () => void,
): Promise<int32> {
  let visits = 0 as int32;
  for (let index = 0 as int32; index < 3; effect()) {
    index++;
    const completed = await pending();
    if (completed == null) continue;
    visits++;
  }
  return visits;
}
`;

export const finiteCompletionSequencingNativeProgram = `
var calls = "";
var pending = new System.Threading.Tasks.TaskCompletionSource(System.Threading.Tasks.TaskCreationOptions.RunContinuationsAsynchronously);
var running = Tsonic.Generated.Index.ordered(
    () => { calls += "L"; return 11; },
    () => { calls += "P"; return Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(pending.Task); },
    () => { calls += "R"; return 22; },
    (left, completed, right) => { calls += "C"; if (left != 11 || completed != null || right != 22) throw new System.Exception("ordered values"); return 33; });
if (calls != "LP" || running.IsCompleted) throw new System.Exception("native argument evaluation order before suspension");
pending.SetResult();
if (await running != 33 || calls != "LPRC") throw new System.Exception("native argument evaluation order after suspension");
var invocations = 0;
Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>? Sync() { invocations++; return Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From1(44); }
if (await Tsonic.Generated.Index.conditional(false, Sync, () => 55) != 55 || invocations != 0)
    throw new System.Exception("unselected conditional branch executed");
await Tsonic.Generated.Index.lazyAnd(false, Sync);
await Tsonic.Generated.Index.lazyOr(true, Sync);
if (await Tsonic.Generated.Index.coalesce(66, Sync) != 66 || invocations != 0)
    throw new System.Exception("unselected short-circuit branch executed");
if (await Tsonic.Generated.Index.conditional(true, Sync, () => 55) != 44 || invocations != 1)
    throw new System.Exception("selected conditional branch skipped");
if (await Tsonic.Generated.Index.snapshot(() => Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(System.Threading.Tasks.Task.CompletedTask)) != 1)
    throw new System.Exception("earlier local read moved after later argument mutation");
var advances = 0;
var visits = await Tsonic.Generated.Index.loop(
    () => Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(System.Threading.Tasks.Task.CompletedTask),
    () => advances++);
if (visits != 0 || advances != 3) throw new System.Exception("continue skipped native increment region");
var failure = new System.InvalidOperationException("native sequencing failure");
calls = "";
try {
    await Tsonic.Generated.Index.ordered(() => { calls += "L"; return 11; },
        () => { calls += "P"; return Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(System.Threading.Tasks.Task.FromException(failure)); },
        () => { calls += "R"; return 22; }, (left, completed, right) => 33);
    throw new System.Exception("native failure ignored");
} catch (System.InvalidOperationException actual) {
    if (!object.ReferenceEquals(actual, failure) || calls != "LP") throw new System.Exception("failure identity or effect boundary changed");
}
`;
