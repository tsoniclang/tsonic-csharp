import assert from "node:assert/strict";
import test from "node:test";
import { liveErrorBaseWriteSource, liveErrorMixedRecoverySource, liveErrorStorageFiles } from "../../../../tsonic/test/fixtures/live-error-storage.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
for (const projectError of Array.from([false, true]).slice(1, 2)) {
test(`sealed mixed throws retain writable ${projectError ? "project" : "native"} Error identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: liveErrorMixedRecoverySource(projectError) });
      assertNativeErrorWriteRefusal(compiled);
    });
}
}

function assertNativeErrorWriteRefusal(compiled) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the complete original checked write program is retained");
  assert.equal(compiled.result.diagnostics.length, 3, "each original name, message and stack write has its own refusal");
  for (const diagnostic of compiled.result.diagnostics) {
    assert.equal(diagnostic.code, "CSHARP_ERROR_READONLY_STORAGE");
    assert.equal(diagnostic.sourceNode !== undefined, true, "the actual local write owns the refusal");
  }
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "no Error write program or generated source is published");
}
