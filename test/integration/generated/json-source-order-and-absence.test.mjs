import test from "node:test";
import { jsonSourceOrderAndAbsenceSource } from "../../../../tsonic/test/fixtures/json-source-order-and-absence.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

test("JSON preserves authored property order and the single native absence in replacers", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: jsonSourceOrderAndAbsenceSource }),
    "json-source-order-and-absence", false, false, [], "Tsonic.Generated.Index.run();");
});
