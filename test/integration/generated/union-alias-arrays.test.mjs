import { assertNumericLiteralRefusal, numericCompoundRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import test from "node:test";
import { unionAliasArrayFiles } from "../../../../tsonic/test/fixtures/union-alias-arrays.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`equivalent cross-file union aliases retain one array element representation on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const original = compileCsharpSource({ surface, sourceText: unionAliasArrayFiles["index.ts"],
      files: { "contracts.ts": unionAliasArrayFiles["contracts.ts"] } });
    assertNumericLiteralRefusal(original, [numericCompoundRefusal("+=", "result += value")]);
    const compiled = compileCsharpSource({ surface, sourceText: unionAliasArrayFiles["index.ts"].replace("let result = 0", "let result: number = 0"),
      files: { "contracts.ts": unionAliasArrayFiles["contracts.ts"] } });
    executeCsharpConstruction(compiled, `union-alias-arrays-${surface ?? "native"}`);
  });
}
