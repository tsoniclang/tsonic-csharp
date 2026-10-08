import test from "node:test";
import { providerEvaluationOrderSource } from "../../../../tsonic/test/fixtures/provider-evaluation-order.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("provider conversions retain disjoint mutation and overlapping receiver evaluation order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: providerEvaluationOrderSource }),
    "provider-evaluation-order");
});
