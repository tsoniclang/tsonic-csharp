import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeAggregateInferenceSource, nativeAggregateInferenceRejections } from "../../../../tsonic/test/fixtures/native-aggregate-inference.mjs";

test("aggregate generic inference preserves native carriers through nested arrays, records and spreads", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeAggregateInferenceSource });
  executeCsharpConstruction(compiled, "native-aggregate-inference");
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /BigInteger|\(double\)\s*(?:exact|maximum)/u);
});

for (const { name, source } of nativeAggregateInferenceRejections) {
  test(`aggregate inference rejects ${name} without publishing target output`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: source });
    assert.ok(compiled.result.diagnostics.some(diagnostic => diagnostic.category === "error"));
    assert.equal(compiled.artifacts.size, 0);
  });
}
