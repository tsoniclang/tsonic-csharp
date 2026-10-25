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
    if (surface === "js") {
      assert.match(output, /ObserveDiscarded\(/u, "the JS Promise API keeps its separate rejection-observation action");
      assert.equal((output.match(/global::Tsonic\.Generated\.Index\.produce\(global::Tsonic\.Generated\.Index\.argument\(\)\)/gu) ?? []).length,
        5, "all five authored call sites remain, including the two-iteration update call");
    } else {
      assert.match(output, /_ = global::Tsonic\.Generated\.Index\.produce\(global::Tsonic\.Generated\.Index\.argument\(\)\)/u);
      assert.doesNotMatch(output, /ObserveDiscarded\(/u, "a native Task discard does not claim rejection observation");
    }
    assert.match(output, /await retained/u);
    assert.doesNotMatch(output, /Task\.Run|Wait\(|\.Result\b/u);
  });
}
