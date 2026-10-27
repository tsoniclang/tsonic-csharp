import assert from "node:assert/strict";
import test from "node:test";
import { liveErrorBaseWriteSource, liveErrorMixedRecoverySource, liveErrorStorageFiles } from "../../../../tsonic/test/fixtures/live-error-storage.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
for (const projectError of Array.from([false, true]).slice(1, 2)) {
test(`sealed mixed throws retain writable ${projectError ? "project" : "native"} Error identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: liveErrorMixedRecoverySource(projectError) });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `mixed-error-recovery-${surface ?? "native"}-${projectError ? "project" : "native"}`);
    });
}
}
