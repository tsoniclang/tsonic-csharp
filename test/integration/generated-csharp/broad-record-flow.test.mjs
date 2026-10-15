import assert from "node:assert/strict";
import test from "node:test";
import { broadRecordFlowSource, freshBroadArraySource, mixedNativeArraySource } from "../../../../tsonic/test/fixtures/broad-record-flow.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("guarded broad record reads preserve raw storage and array backing", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: broadRecordFlowSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /TsValue current\b/u);
  assert.doesNotMatch(output, /\.ToArray\(|\.Select\(/u);
  executeCsharpConstruction(compiled, "broad-record-flow");
});

test("fresh nested broad arrays retain empty, primitive and exact integer carriers", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: freshBroadArraySource });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /9007199254740993/u);
  assert.doesNotMatch(output, /\.ToArray\(|\.Select\(/u);
  executeCsharpConstruction(compiled, "fresh-broad-arrays");
});

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`heterogeneous native arrays infer exact integer union arms in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: mixedNativeArraySource });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /Union<string, ulong>|Union<ulong, string>/u);
    assert.doesNotMatch(output, /BigInteger|\.ToArray\(|\.Select\(/u);
    executeCsharpConstruction(compiled, `mixed-native-array-carriers-${lane}`);
  });
}
