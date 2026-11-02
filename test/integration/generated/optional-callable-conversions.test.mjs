import test from "node:test";
import { optionalCallableConversionSource } from "../../../../tsonic/test/fixtures/optional-callable-conversions.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNumericLiteralRefusal, numericDefaultCallableRefusal } from "../../helpers/numeric-literal-rulings.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`stored optional, default and discarded callable conversions preserve evaluation in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalCallableConversionSource });
    assertNumericLiteralRefusal(compiled, [numericDefaultCallableRefusal("defaulted")]);
  });
  test(`own-number optional, default and discarded callable conversions preserve evaluation in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalCallableConversionSource.replace("defaulted(value = 11)",
      "defaulted(value: number = 11)") });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `optional-callable-conversions-${lane}`);
  });
}
