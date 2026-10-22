import assert from "node:assert/strict";
import test from "node:test";
import { errorContainerStorageFiles } from "../../../../tsonic/test/fixtures/error-container-storage.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`Error container storage preserves exact element identity in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: errorContainerStorageFiles["index.ts"],
      files: { "mutate.ts": errorContainerStorageFiles["mutate.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(emitted, /InvokeDynamic|ReadDynamicSlot|Unsafe\.|dynamic\b|GetType\(|Activator\./u);
    executeCsharpConstruction(compiled, `error-container-storage-${lane}`);
  });
}
