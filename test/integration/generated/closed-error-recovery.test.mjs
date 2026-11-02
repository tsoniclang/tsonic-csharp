import assert from "node:assert/strict";
import test from "node:test";
import { closedErrorRecoveryFiles, readonlyClosedErrorRecoveryFiles } from "../../../../tsonic/test/fixtures/closed-error-recovery.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNativeErrorWriteRefusals } from "../../helpers/native-error-refusals.mjs";

for (const surface of ["native", "js"]) {
  test(`closed project Error subtype recovery keeps exact fields, identity and live mutation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: closedErrorRecoveryFiles["index.ts"],
      files: { "failures.ts": closedErrorRecoveryFiles["failures.ts"] } });
    assertNativeErrorWriteRefusals(compiled, ["value.message", "value.stack", "other.name", "caught.message", "caught.stack"]);
  });
  test(`readonly project Error subtype recovery keeps exact fields, identity and live own-field mutation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: readonlyClosedErrorRecoveryFiles["index.ts"],
      files: { "failures.ts": readonlyClosedErrorRecoveryFiles["failures.ts"] } });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /dynamic|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `closed-error-recovery-${surface}`);
  });
}
