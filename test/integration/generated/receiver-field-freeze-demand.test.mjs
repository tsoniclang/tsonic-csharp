import test from "node:test";
import { assertNumericLiteralRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import { retainedFieldFreezeOrigins, retainedFieldFreezeOriginSource, retainedFieldGenericFreezeSource } from "../../../../tsonic/test/fixtures/retained-field-freeze-origins.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const numericRefusals = {
  "structural-chain": [
    {
      "code": "CSHARP_UNSUPPORTED_AST",
      "message": "No exact C# implicit conversion relates 'target:tsonic.source:/project/index.ts\u0000264\u00000\u0000127<>' to 'target:tsonic.shape:3c3abf6f467d37ff92dafc998150cd1ea478e86217af28e3989f5f702baa9955<target:System.String<>,source:float64>'.",
      "text": "value"
    }
  ],
  "interface": [
    {
      "code": "CSHARP_UNSUPPORTED_AST",
      "message": "No exact C# implicit conversion relates 'target:tsonic.source:/project/index.ts\u0000264\u00000\u0000127<>' to 'target:tsonic.source:/project/index.ts\u0000265\u0000127\u0000162<>'.",
      "text": "value"
    }
  ]
};

for (const { name, declarations, invocation } of retainedFieldFreezeOrigins) {
  test(`retained direct writes through ${name} readonly views preserve mutable aliases`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: retainedFieldFreezeOriginSource(declarations, invocation) });
    if (numericRefusals[name] !== undefined) {
      assertNumericLiteralRefusal(compiled, numericRefusals[name]);
      return;
    }
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `retained-field-freeze-origin-${name}`);
  });
  if (numericRefusals[name] !== undefined) test(
    `retained direct writes through ${name} own-number readonly views preserve mutable aliases`, { timeout: 300_000 }, () => {
      const sourceText = retainedFieldFreezeOriginSource(declarations, invocation).replace("value = 1;", "value: number = 1;");
      const compiled = compileCsharpSource({ surface: "js", sourceText });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `retained-field-own-number-freeze-origin-${name}`);
    });
}

test("generic inherited field captures preserve mutation through readonly views", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: retainedFieldGenericFreezeSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "retained-field-freeze-generic-inherited");
});
