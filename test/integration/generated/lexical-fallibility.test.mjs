import test from "node:test";
import { lexicalFallibilitySource } from "../../../../tsonic/test/fixtures/lexical-fallibility.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native lexical errors preserve transitive effects and caught identity in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: lexicalFallibilitySource });
    executeCsharpConstruction(compiled, "lexical-fallibility", false);
  });
}
