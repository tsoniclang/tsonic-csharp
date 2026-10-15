import test from "node:test";
import { lexicalCaptureConversionSource } from "../../../../tsonic/test/fixtures/lexical-capture-conversions.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`lexical captures retain native storage before contextual conversions in ${surface}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: lexicalCaptureConversionSource });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `lexical-capture-conversions-${surface}`);
    });
}
