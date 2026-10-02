import test from "node:test";
import { optionalCallableConversionSource } from "../../../../tsonic/test/fixtures/optional-callable-conversions.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`stored optional, default and discarded callable conversions preserve evaluation in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalCallableConversionSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `optional-callable-conversions-${lane}`);
  });
}
