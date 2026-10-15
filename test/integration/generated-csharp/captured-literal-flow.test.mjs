import test from "node:test";
import { capturedLiteralFlowSource } from "../../../../tsonic/test/fixtures/captured-literal-flow.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`captured literal guards retain native source members on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: capturedLiteralFlowSource });
    executeCsharpConstruction(compiled, `captured-literal-flow-${surface ?? "native"}`);
  });
}
