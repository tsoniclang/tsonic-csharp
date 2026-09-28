import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCsharpSource, compileCsharpSource, assertCsharpCompilationSucceeded } from "../helpers/direct-csharp-session.mjs";
import { sourceCallabilityPositiveCases, sourceCallabilityNegativeCases, sourceCallabilityEmissionSource }
  from "../../../tsonic/test/fixtures/source-callability.mjs";

for (const surface of [undefined, "js"]) {
  const profile = surface ?? "native";
  for (const entry of sourceCallabilityPositiveCases) {
    test(`${profile}: ${entry.name}`, () => {
      const checked = checkCsharpSource({ surface, sourceText: entry.source });
      assert.equal(checked.sourceDiagnosticsText, "");
      assert.deepEqual(checked.extensionDiagnostics, []);
    });
  }
  for (const entry of sourceCallabilityNegativeCases) {
    test(`${profile}: ${entry.name}`, () => {
      const checked = checkCsharpSource({ surface, sourceText: entry.source });
      assert.match(checked.sourceDiagnosticsText, entry.diagnostic);
    });
  }
  test(`${profile}: ambient callable identity has no emitted representation`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: sourceCallabilityEmissionSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.ok(compiled.artifacts.size > 0);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /\b(?:callable|CallableFunction|NewableFunction)\b/u);
  });
}
