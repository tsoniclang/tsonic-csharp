import assert from "node:assert/strict";
import test from "node:test";
import { nativeAsyncDiscardSource } from "../../../../tsonic/test/fixtures/native-async-discard.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`discarded Tasks retain native eager execution on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeAsyncDiscardSource(6) });
    executeCsharpConstruction(compiled, "native-async-discard", true);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /_ = produce\(argument\(\)\)/u);
    assert.match(output, /await retained/u);
    assert.doesNotMatch(output, /Task\.Run|Wait\(|\.Result\b/u);
  });
}
