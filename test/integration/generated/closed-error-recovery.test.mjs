import assert from "node:assert/strict";
import test from "node:test";
import { closedErrorRecoveryFiles } from "../../../../tsonic/test/fixtures/closed-error-recovery.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`closed project Error subtype recovery keeps exact fields, identity and live mutation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: closedErrorRecoveryFiles["index.ts"],
      files: { "failures.ts": closedErrorRecoveryFiles["failures.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /dynamic|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `closed-error-recovery-${surface}`);
  });
}
