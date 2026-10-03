import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { finiteCompletionSequencingSource, finiteCompletionSequencingNativeProgram } from "../../../helpers/finite-completion-sequencing.mjs";

for (const surface of [undefined, "js"]) {
  test(`native planned completion preserves ordering, laziness and failures on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: finiteCompletionSequencingSource, surface });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(source, /ContinueWith|Task\.Run|Task\.FromResult|new (?:System\.)?Func|async .*=>/u);
    executeCsharpConstruction(compiled, `planned-completion-${surface ?? "native"}`, true, false, [], finiteCompletionSequencingNativeProgram);
  });
}

test("native assignment keeps the acquired array cell and old compound value through suspension", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    type Completion = int32 | Promise<void> | undefined;
    export async function assign(owner: () => int32[], index: () => int32, pending: () => Completion): Promise<int32> {
      return owner()[index()] = (await pending()) ?? (7 as int32);
    }
    export async function compound(owner: () => int32[], index: () => int32, pending: () => Completion): Promise<int32> {
      return owner()[index()] += (await pending()) ?? (7 as int32);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "planned-native-locations", true, false, [], `
    foreach (var compound in new[] { false, true }) {
      var original = new[] { 5 };
      var replacement = new[] { 100 };
      var current = original;
      var calls = "";
      var completion = new System.Threading.Tasks.TaskCompletionSource(System.Threading.Tasks.TaskCreationOptions.RunContinuationsAsynchronously);
      int[] Owner() { calls += "O"; return current; }
      int Index() { calls += "I"; return 0; }
      Tsonic.CSharp.Runtime.Union<int,System.Threading.Tasks.Task>? Pending() {
        calls += "P"; original[0] = 50; current = replacement;
        return Tsonic.CSharp.Runtime.Union<int,System.Threading.Tasks.Task>.From2(completion.Task);
      }
      var running = compound ? Tsonic.Generated.Index.compound(Owner, Index, Pending)
        : Tsonic.Generated.Index.assign(Owner, Index, Pending);
      if (calls != "OIP" || running.IsCompleted) throw new System.Exception("location acquisition ordering");
      completion.SetResult();
      var expected = compound ? 12 : 7;
      if (await running != expected || original[0] != expected || replacement[0] != 100 || calls != "OIP")
        throw new System.Exception("location identity or old-value capture changed");
    }
  `);
});

test("base argument regions preserve one evaluation and native parameter mutation without delegate helpers", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    class Base {
      left: int32; right: int32;
      constructor(left: int32, right: int32) { this.left = left; this.right = right; }
    }
    class Derived extends Base {
      value: int32;
      constructor(value: int32, effect: () => void) {
        super((effect(), value += 1), value);
        this.value = value;
      }
    }
    export function run(): boolean {
      let effects = 0 as int32;
      const item = new Derived(4 as int32, () => { effects++; });
      return effects === 1 && item.left === 5 && item.right === 5 && item.value === 5;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const source = [...compiled.artifacts.values()].join("\n");
  assert.match(source, /private static int __tsonic_base_argument/u);
  assert.doesNotMatch(source, /Func<[^>]*>.*__tsonic_base_argument|async .*=>/u);
  executeCsharpConstruction(compiled, "planned-base-argument");
});
