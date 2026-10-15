import assert from "node:assert/strict";
import test from "node:test";
import { polymorphicThisResultsSource } from "../../../../tsonic/test/fixtures/polymorphic-this-results.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`checked polymorphic this returns preserve the actual result and derived members in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: polymorphicThisResultsSource });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(emitted, /InvokeDynamic|ReadDynamicSlot|Unsafe\.|dynamic\b|GetType\(|Activator\./u);
    executeCsharpConstruction(compiled, `polymorphic-this-results-${lane}`);
  });
}
