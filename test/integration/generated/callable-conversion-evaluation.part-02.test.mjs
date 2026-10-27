import assert from "node:assert/strict";
import test from "node:test";
import { absenceCallableConversionSource, broadCallableConversionSource, broadAsyncCallableConversionSource, nativeCallableAdapterCostSource, nativeCallableInputBorrowSource } from "../../../../tsonic/test/fixtures/callable-conversion-evaluation.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
const lane = surface ?? "native";

test(`broad async callbacks retain their producer Task and live captures in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: broadAsyncCallableConversionSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(output, /\(\(Func<[^;]+\)\(async/su);
    executeCsharpConstruction(compiled, `broad-async-callable-conversion-${lane}`, true);
  });
}
