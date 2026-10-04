import assert from "node:assert/strict";
import test from "node:test";
import { constructorReadinessSource } from "../../../../tsonic/test/fixtures/constructor-readiness.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native construction preserves cleanup, receiver identity and inherited effects in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: constructorReadinessSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /dynamic|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `constructor-readiness-${surface}`);
  });
}
