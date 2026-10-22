import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeNullishRecordsSource } from "../../../../tsonic/test/fixtures/native-nullish-records.mjs";

for (const surface of [undefined, "js"]) {
  test(`native record coalescing retains backing and lazy fallback on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeNullishRecordsSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /Dictionary<string, ulong>/u);
    assert.doesNotMatch(output, /Convert\.ToDouble|ulong_to_f64|u64_to_f64/u);
    executeCsharpConstruction(compiled, "native-nullish-records");
  });
}
