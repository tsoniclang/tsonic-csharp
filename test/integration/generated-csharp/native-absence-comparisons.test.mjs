import assert from "node:assert/strict";
import test from "node:test";
import { nativeAbsenceComparisonSource } from "../../../../tsonic/test/fixtures/native-absence-comparisons.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native absence comparisons retain physical class and record storage in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeAbsenceComparisonSource +
      '\nexport function main(): void { if (!run()) throw new Error("native absence comparisons"); }' });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/dynamic|Unsafe\.|GetProperty|Activator/u.test([...compiled.artifacts.values()].join("\n")), false,
      "absence comparison uses native storage without reflection or unsafe adapters");
    executeCsharpConstruction(compiled, `native-absence-comparisons-${surface}`);
  });
}
