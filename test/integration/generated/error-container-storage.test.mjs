import assert from "node:assert/strict";
import test from "node:test";
import { errorContainerStorageFiles, readonlyErrorContainerStorageFiles } from "../../../../tsonic/test/fixtures/error-container-storage.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNativeErrorWriteRefusals } from "../../helpers/native-error-refusals.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`Error container storage preserves exact element identity in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: errorContainerStorageFiles["index.ts"],
      files: { "mutate.ts": errorContainerStorageFiles["mutate.ts"] } });
    assertNativeErrorWriteRefusals(compiled, ["values[0].name", "values[0].message", "values[0].stack", "values[1].message", "selected.message"]);
  });
  test(`readonly Error container storage preserves exact element identity and live own fields in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: readonlyErrorContainerStorageFiles["index.ts"],
      files: { "mutate.ts": readonlyErrorContainerStorageFiles["mutate.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(emitted, /InvokeDynamic|ReadDynamicSlot|Unsafe\.|dynamic\b|GetType\(|Activator\./u);
    executeCsharpConstruction(compiled, `error-container-storage-${lane}`);
  });
}
