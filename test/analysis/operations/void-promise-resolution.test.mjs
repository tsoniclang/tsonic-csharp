import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} explicit void Promise resolution evaluates its argument once and preserves native Task identity`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
let calls: int32 = 0;
function touch(): void { calls += 1; }
export function count(): int32 { return calls; }
export function absent(): Promise<void> { return Promise.resolve<void>(undefined); }
export function effect(): Promise<void> { return Promise.resolve<void>(touch()); }
export function erased(): Promise<void> { return Promise.resolve<void>(void touch()); }
export function completed(value: Promise<void>): Promise<void> { return Promise.resolve<void>(value); }
export function scalar(value: int64): Promise<int64> { return Promise.resolve<int64>(value); }
export function pending(value: Promise<int64>): Promise<int64> { return Promise.resolve<int64>(value); }
` });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(generated.includes("CompletedTask"), true, "void resolution uses the existing native completed Task");
    assert.equal(/PromiseRuntime(?:<void>)?\.Resolved\(default\(void\)\)/u.test(generated), false,
      "void does not become a fictitious runtime value overload");
    executeCsharpConstruction(compiled, `${surface}-void-promise-resolution`, false, false, [], `
var completed = System.Threading.Tasks.Task.CompletedTask;
if (!object.ReferenceEquals(completed, Tsonic.Generated.Index.absent()))
    throw new System.Exception("absent completed Task identity");
if (!object.ReferenceEquals(completed, Tsonic.Generated.Index.effect()) || Tsonic.Generated.Index.count() != 1)
    throw new System.Exception("void argument must run once");
if (!object.ReferenceEquals(completed, Tsonic.Generated.Index.erased()) || Tsonic.Generated.Index.count() != 2)
    throw new System.Exception("void operand must run once");
var pending = new System.Threading.Tasks.TaskCompletionSource().Task;
if (!object.ReferenceEquals(pending, Tsonic.Generated.Index.completed(pending)))
    throw new System.Exception("pending void Task identity");
long wide = 9007199254740993L;
if (Tsonic.Generated.Index.scalar(wide).GetAwaiter().GetResult() != wide)
    throw new System.Exception("exact native payload");
var existing = System.Threading.Tasks.Task.FromResult(wide);
if (!object.ReferenceEquals(existing, Tsonic.Generated.Index.pending(existing)))
    throw new System.Exception("non-void Task identity");
for (int index = 0; index < 4096; index++) _ = Tsonic.Generated.Index.pending(existing);
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) _ = Tsonic.Generated.Index.pending(existing);
if (System.GC.GetAllocatedBytesForCurrentThread() != before)
    throw new System.Exception("native Task forwarding allocated");
`);
  });
}
