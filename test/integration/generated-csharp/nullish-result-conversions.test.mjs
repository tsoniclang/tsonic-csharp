import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nullishResultConversionsSource } from "../../../../tsonic/test/fixtures/nullish-result-conversions.mjs";

for (const surface of [undefined, "js"]) {
  test(`nullish results retain their native carrier before destination conversion (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nullishResultConversionsSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "nullish-result-conversions");
  });
}
