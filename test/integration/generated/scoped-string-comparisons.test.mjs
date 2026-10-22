import test from "node:test";
import { scopedStringComparisonsSource } from "../../../../tsonic/test/fixtures/scoped-string-comparisons.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const profile of ["native", "js"]) {
  test(`scoped string comparisons preserve native snapshots and literals in ${profile}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: profile, sourceText: scopedStringComparisonsSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `scoped-string-comparisons-${profile}`, false, false, [],
      "Tsonic.Generated.Index.main();");
  });
}
