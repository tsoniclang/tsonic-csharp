import test from "node:test";
import { optionalSelectedIndexSource } from "../../../../tsonic/test/fixtures/optional-selected-indexes.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("exact ordinal and broad capture indexes preserve optional native results", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: optionalSelectedIndexSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "optional-selected-indexes");
});
