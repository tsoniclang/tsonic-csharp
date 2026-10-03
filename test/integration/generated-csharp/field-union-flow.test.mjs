import test from "node:test";
import { fieldUnionFlowSource } from "../../../../tsonic/test/fixtures/field-union-flow.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`field union reads retain checked projections after mutation on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: fieldUnionFlowSource });
    executeCsharpConstruction(compiled, `field-union-flow-${surface ?? "native"}`);
  });
}
