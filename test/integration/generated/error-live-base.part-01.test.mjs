import assert from "node:assert/strict";
import test from "node:test";
import { liveErrorBaseWriteSource, liveErrorMixedRecoverySource, liveErrorStorageFiles } from "../../../../tsonic/test/fixtures/live-error-storage.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
test(`live inherited Error storage survives base values and throw recovery in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: liveErrorStorageFiles["index.ts"],
      files: { "failures.ts": liveErrorStorageFiles["failures.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /class HttpError\s*:\s*(?:global::)?Tsonic\.CSharp\.Runtime\.Error/);
    executeCsharpConstruction(compiled, `live-error-storage-${surface ?? "native"}`);
  });

test(`writes through Error base values retain native field identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: liveErrorBaseWriteSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `live-error-writes-${surface ?? "native"}`);
  });

for (const projectError of Array.from([false, true]).slice(0, 2)) {
test(`sealed mixed throws retain writable ${projectError ? "project" : "native"} Error identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: liveErrorMixedRecoverySource(projectError) });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `mixed-error-recovery-${surface ?? "native"}-${projectError ? "project" : "native"}`);
    });
}
}

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
test(`live inherited Error storage survives base values and throw recovery in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: liveErrorStorageFiles["index.ts"],
      files: { "failures.ts": liveErrorStorageFiles["failures.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /class HttpError\s*:\s*(?:global::)?Tsonic\.CSharp\.Runtime\.Error/);
    executeCsharpConstruction(compiled, `live-error-storage-${surface ?? "native"}`);
  });

test(`writes through Error base values retain native field identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: liveErrorBaseWriteSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `live-error-writes-${surface ?? "native"}`);
  });

for (const projectError of Array.from([false, true]).slice(0, 1)) {
test(`sealed mixed throws retain writable ${projectError ? "project" : "native"} Error identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: liveErrorMixedRecoverySource(projectError) });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `mixed-error-recovery-${surface ?? "native"}-${projectError ? "project" : "native"}`);
    });
}
}
