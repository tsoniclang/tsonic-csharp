import test from "node:test";
import { typedBroadRecordFlowSource } from "../../../../tsonic/test/fixtures/broad-record-flow.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("typed broad record array views preserve the original backing", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: typedBroadRecordFlowSource }), "typed-broad-record-flow");
});
