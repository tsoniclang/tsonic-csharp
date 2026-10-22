import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { sourceProfileCategoriesSource } from "../../../../tsonic/test/fixtures/source-profile-categories.mjs";

test("source-profile producers retain exact native object, callable and symbol categories", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: sourceProfileCategoriesSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "source-profile-categories");
});
