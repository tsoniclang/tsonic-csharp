import assert from "node:assert/strict";
import test from "node:test";
import { optionalProjectCarriersSource } from "../../../../tsonic/test/fixtures/optional-project-carriers.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`optional project positions preserve live derived identity in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalProjectCarriersSource });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(emitted, /InvokeDynamic|ReadDynamicSlot|Unsafe\.|dynamic\b|GetType\(|Activator\./u);
    executeCsharpConstruction(compiled, `optional-project-carriers-${lane}`);
  });
}
