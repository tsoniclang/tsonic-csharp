import test from "node:test";
import { optionalRecordSpreadsSource } from "../../../../tsonic/test/fixtures/optional-record-spreads.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`optional record spreads preserve native presence and order on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: optionalRecordSpreadsSource }),
      `optional-record-spreads-${surface ?? "native"}`);
  });
}
