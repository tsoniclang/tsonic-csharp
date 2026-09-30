import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { partialRecordAbsenceSource } from "../../../../tsonic/test/fixtures/partial-record-absence.mjs";
import { sourceProfileAliasIdentityFiles, sourceProfileAliasIdentitySource } from "../../../../tsonic/test/fixtures/source-profile-alias-identity.mjs";

test("partial records preserve absence, present zero, and copied result slots", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: partialRecordAbsenceSource });
  executeCsharpConstruction(compiled, "partial-record-absence");
});

test("cross-file generic profile aliases preserve exact carriers without recognizing local homonyms", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: sourceProfileAliasIdentitySource,
    files: sourceProfileAliasIdentityFiles });
  executeCsharpConstruction(compiled, "source-profile-alias-identity");
});
