import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { partialNativeGuardsSource } from "../../../../tsonic/test/fixtures/partial-native-guards.mjs";

for (const surface of [undefined, "js"]) {
  test(`partial native guards preserve stronger checked evidence on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: partialNativeGuardsSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "partial-native-guards");
  });
}
