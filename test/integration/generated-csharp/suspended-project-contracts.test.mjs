import test from "node:test";
import { suspendedProjectContractsSource } from "../../../../tsonic/test/fixtures/suspended-project-contracts.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("suspended project contracts retain native input ownership, completion and exact Error effects", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: suspendedProjectContractsSource }),
    "suspended-project-contracts", true);
});
