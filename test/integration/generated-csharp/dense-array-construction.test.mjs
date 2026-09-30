import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { denseArrayConstructionSource, denseArrayEvaluationSource } from "../../../../tsonic/test/fixtures/dense-array-construction.mjs";

for (const [name, sourceText] of [["storage", denseArrayConstructionSource], ["evaluation", denseArrayEvaluationSource]]) {
  test(`dense array construction preserves ${name} without temporary arrays`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    executeCsharpConstruction(compiled, `dense-array-${name}`);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /AppendSequence/u);
    assert.doesNotMatch(generated, /\.concat\(/u);
  });
}
