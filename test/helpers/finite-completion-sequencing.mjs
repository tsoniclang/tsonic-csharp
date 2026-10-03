export { finiteCompletionSequencingSource } from "../../../tsonic/test/fixtures/finite-completion-sequencing.mjs";

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
var lazyAnd = await Tsonic.Generated.Index.lazyAnd(false, Sync);
var lazyOr = await Tsonic.Generated.Index.lazyOr(true, Sync);
if (!lazyAnd.HasValue || !lazyAnd.Value.Is1() || lazyAnd.Value.As1()
    || !lazyOr.HasValue || !lazyOr.Value.Is1() || !lazyOr.Value.As1())
    throw new System.Exception("short-circuit bool result changed");
if (await Tsonic.Generated.Index.coalesce(66, Sync) != 66 || invocations != 0)
    throw new System.Exception("unselected short-circuit branch executed");
if (await Tsonic.Generated.Index.conditional(true, Sync, () => 55) != 44 || invocations != 1)
    throw new System.Exception("selected conditional branch skipped");
var completedAnd = await Tsonic.Generated.Index.lazyAnd(true, Sync);
var completedOr = await Tsonic.Generated.Index.lazyOr(false, Sync);
if (!completedAnd.HasValue || !completedAnd.Value.Is2() || completedAnd.Value.As2() != 44
    || !completedOr.HasValue || !completedOr.Value.Is2() || completedOr.Value.As2() != 44 || invocations != 3)
    throw new System.Exception("selected logical payload changed");
if (await Tsonic.Generated.Index.lazyAnd(true, () => Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(System.Threading.Tasks.Task.CompletedTask)) != null
    || await Tsonic.Generated.Index.lazyOr(false, () => null) != null)
    throw new System.Exception("logical completion manufactured a second absence");
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
using var cancellation = new System.Threading.CancellationTokenSource();
cancellation.Cancel();
try {
    await Tsonic.Generated.Index.lazyAnd(true,
        () => Tsonic.CSharp.Runtime.Union<int, System.Threading.Tasks.Task>.From2(System.Threading.Tasks.Task.FromCanceled(cancellation.Token)));
    throw new System.Exception("native cancellation ignored");
} catch (System.OperationCanceledException actual) {
    if (actual.CancellationToken != cancellation.Token) throw new System.Exception("native cancellation token changed");
}
`;
