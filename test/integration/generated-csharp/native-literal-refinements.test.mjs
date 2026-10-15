import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeLiteralRefinementsSource } from "../../../../tsonic/test/fixtures/native-literal-refinements.mjs";

for (const surface of ["native", "js"]) {
  test(`literal union refinements preserve field absence and native carriers (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeLiteralRefinementsSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-literal-refinements-${surface}`);
  });
}
