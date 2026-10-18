import assert from "node:assert/strict";
import test from "node:test";
import { nativeCompletionRegionsSource, nativeDefiniteCompletionSource } from "../../../../tsonic/test/fixtures/native-completion-regions.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native completion regions retain definite initialization and every lexical boundary in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeCompletionRegionsSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /dynamic|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `native-completion-regions-${surface}`);
  });
}

for (const surface of ["native", "js"]) {
  test(`native completion outputs retain definite local initialization in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeDefiniteCompletionSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /dynamic|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `native-definite-completion-${surface}`, true);
  });
}
