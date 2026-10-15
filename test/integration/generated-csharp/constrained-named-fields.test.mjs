import test from "node:test";
import { constrainedNamedFieldsSource } from "../../../../tsonic/test/fixtures/constrained-named-fields.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`constrained named fields preserve native widths and aliasing on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: constrainedNamedFieldsSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "constrained-named-fields");
  });
}
