import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nestedUnionProjectionFiles } from "../../../../tsonic/test/fixtures/nested-union-projections.mjs";

for (const surface of [undefined, "js"]) {
  test(`nested native union projections retain payload identity and one absence on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const { "index.ts": sourceText, ...files } = nestedUnionProjectionFiles;
    const compiled = compileCsharpSource({ surface, sourceText, files });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "nested-union-projections");
  });
}
