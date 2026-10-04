import assert from "node:assert/strict";
import test from "node:test";
import { closedIntegerCallbackInputsSource, closedPromiseCallbackInputsSource, closedThrowingCallbackInputsSource, closedNativeCallbackEffectsSource } from "../../../../tsonic/test/fixtures/closed-callback-inputs.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

test("closed integer callback inputs retain native width without per-call allocation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: closedIntegerCallbackInputsSource });
  for (const source of compiled.artifacts.values()) assert.doesNotMatch(source, /Convert.ToDouble/u);
  executeCsharpConstruction(compiled, "closed-callback-inputs", false, false, [], `
if (!Tsonic.Generated.Index.run(1)) throw new System.Exception("warmup");
long Measure(int count) {
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    if (!Tsonic.Generated.Index.run(count)) throw new System.Exception("native callback input");
    return System.GC.GetAllocatedBytesForCurrentThread() - before;
}
var small = Measure(1);
var large = Measure(10_000);
if (small != large) throw new System.Exception($"callback allocation {small} != {large}");
`);
});

test("closed Promise callback inputs preserve authored Error payload and identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: closedPromiseCallbackInputsSource }),
    "closed-promise-callback-inputs", true);
});

test("stored native callbacks preserve thrown Error identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: closedThrowingCallbackInputsSource }),
    "closed-throwing-callback-inputs");
});

test("physical callback effects do not change an infallible direct implementation", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: closedNativeCallbackEffectsSource }),
    "closed-native-callback-effects");
});
