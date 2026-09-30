import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { independentStorageFamilyFiles } from "../../../../tsonic/test/fixtures/generic-storage-families.mjs";

test("independent generic storage families retain distinct nested results", { timeout: 300_000 }, () => {
  const { "index.ts": sourceText, ...files } = independentStorageFamilyFiles;
  const compiled = compileCsharpSource({ surface: "js", sourceText, files });
  executeCsharpConstruction(compiled, "independent-storage-families");
});
