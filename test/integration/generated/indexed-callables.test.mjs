import { assertNumericLiteralRefusal, numericCompoundRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import test from "node:test";
import { indexedCallableSource } from "../../../../tsonic/test/fixtures/indexed-callables.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("indexed callables retain exact presence, evaluation order and shared mutation", { timeout: 300_000 }, () => {
  const original = compileCsharpSource({ surface: "js", sourceText: indexedCallableSource });
  assertNumericLiteralRefusal(original, [numericCompoundRefusal("+=", "total += value")]);
  const compiled = compileCsharpSource({ surface: "js", sourceText: indexedCallableSource.replace("let total = 0", "let total: number = 0") });
  executeCsharpConstruction(compiled, "indexed-callables");
});
