import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nestedUnionProjectionFiles } from "../../../../tsonic/test/fixtures/nested-union-projections.mjs";

const cases = [undefined, "js"].flatMap(surface =>
  [false, true].map(parenthesized => ({ surface, parenthesized })));

for (const { surface, parenthesized } of cases) {
  test(`nested native union projections retain payload identity and one absence on ${surface ?? "native"}${parenthesized ? " with parentheses" : ""}`, { timeout: 300_000 }, () => {
    const { "index.ts": sourceText, ...files } = nestedUnionProjectionFiles;
    const compiled = compileCsharpSource({ surface, sourceText: parenthesized
      ? sourceText.replaceAll("typeof value", "typeof (((value)))") : sourceText, files });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "nested-union-projections");
  });
}
