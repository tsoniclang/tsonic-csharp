import assert from "node:assert/strict";
import test from "node:test";
import { contextualAsyncCompletionSource } from "../../../../tsonic/test/fixtures/contextual-async-completion.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`contextual async completion uses its native Task carrier on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: contextualAsyncCompletionSource });
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /ContinueWith|Task\.Run|Task<[^>]*Absence/u);
    executeCsharpConstruction(compiled, `contextual-async-completion-${surface ?? "native"}`, true);
  });
}
