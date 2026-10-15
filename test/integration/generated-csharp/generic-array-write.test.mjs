import test from "node:test";
import { genericArrayWriteSource } from "../../../../tsonic/test/fixtures/generic-array-write.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`generic array stores retain native element storage on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: genericArrayWriteSource });
    executeCsharpConstruction(compiled, `generic-array-write-${surface ?? "native"}`);
  });
}
