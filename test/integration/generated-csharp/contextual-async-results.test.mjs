import assert from "node:assert/strict";
import test from "node:test";
import { contextualAsyncResultSource, ordinaryAsyncResultSource } from "../../../../tsonic/test/fixtures/contextual-async-results.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native JS async bodies retain contextual union completion, captures, aliases and rejection", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: contextualAsyncResultSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "contextual-async-results", true);
});

for (const surface of [undefined, "js"]) {
  test(`ordinary async output stays native and lossless on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: ordinaryAsyncResultSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.match(output, /\blong\b/u);
    assert.doesNotMatch(output, /\bBigInteger\b|9007199254740992/u);
    executeCsharpConstruction(compiled, `ordinary-async-results-${surface ?? "native"}`, true, false, [],
      "await Tsonic.Generated.Index.main();");
  });
}
