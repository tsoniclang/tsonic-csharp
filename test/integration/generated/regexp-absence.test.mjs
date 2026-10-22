import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { regexpAbsenceSource } from "../../../../tsonic/test/fixtures/regexp-absence.mjs";

test("RegExp capture, index and split results preserve one native absence", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: regexpAbsenceSource });
  executeCsharpConstruction(compiled, "regexp-absence");
});
