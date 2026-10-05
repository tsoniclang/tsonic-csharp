import test from "node:test";
import { optionalRecordReadsSource } from "../../../../tsonic/test/fixtures/optional-record-reads.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`optional record reads retain selected results and lazy keys on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: optionalRecordReadsSource }),
      "optional-record-reads");
  });
}
