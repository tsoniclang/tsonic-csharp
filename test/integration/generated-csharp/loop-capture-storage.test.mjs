import assert from "node:assert/strict";
import test from "node:test";
import { loopCaptureStorageSource } from "../../../../tsonic/test/fixtures/loop-capture-storage.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`lexical loop activations retain copied and live captures in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: loopCaptureStorageSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/\bdynamic\b|Unsafe\.|Activator/u.test([...compiled.artifacts.values()].join("\n")), false);
    executeCsharpConstruction(compiled, `loop-capture-storage-${surface}`,
      false, false, [], "Tsonic.Generated.Index.main();");
  });
}
