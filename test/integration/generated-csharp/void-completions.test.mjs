import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { voidCompletionSource } from "../../../../tsonic/test/fixtures/void-completions.mjs";

for (const surface of ["native", "js"]) {
  test(`void completions preserve effects and native absence on ${surface}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: voidCompletionSource }), `void-completions-${surface}`);
  });
}
