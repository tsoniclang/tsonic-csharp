import test from "node:test";
import { retainedLexicalCompletionsSource } from "../../../../tsonic/test/fixtures/retained-lexical-completions.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("retained lexical completions preserve owning, generic, repeated, mutable and thrown captures", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: retainedLexicalCompletionsSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "retained-lexical-completions", true, false, [],
    "await Tsonic.Generated.Index.main();");
});
