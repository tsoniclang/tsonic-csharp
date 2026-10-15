import test from "node:test";
import { rejectedErrorFlowSource } from "../../../../tsonic/test/fixtures/rejected-error-flow.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("JS rejection callbacks preserve checked native Error reads", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: rejectedErrorFlowSource });
  executeCsharpConstruction(compiled, "rejected-error-flow-js", true);
});
