import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { closedRuntimeCategoriesSource } from "../../../../tsonic/test/fixtures/closed-runtime-categories.mjs";

for (const surface of ["native", "js"]) {
  test(`closed runtime category comparisons retain repeated arms and one evaluation (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: closedRuntimeCategoriesSource });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(source, /System\.Reflection|GetType\(|\bdynamic\b/);
    executeCsharpConstruction(compiled, `closed-runtime-categories-${surface}`);
  });
}
