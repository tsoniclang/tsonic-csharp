import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { checkedAbsenceSource } from "../../../../tsonic/test/fixtures/checked-absence.mjs";

test("checked array values and loose absence tests use the canonical native absence", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: checkedAbsenceSource }), "checked-absence");
});
