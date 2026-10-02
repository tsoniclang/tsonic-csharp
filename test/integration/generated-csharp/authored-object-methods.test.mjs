import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { authoredObjectMethodEvidenceSource } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";

for (const surface of [undefined, "js"]) {
  test(`authored ordinary methods retain their exact body and shared captures (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: authoredObjectMethodEvidenceSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `authored-object-methods-${surface ?? "native"}`);
  });
}
