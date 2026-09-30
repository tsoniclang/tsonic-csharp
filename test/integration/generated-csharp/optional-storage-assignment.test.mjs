import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { optionalStorageAssignmentSource } from "../../../../tsonic/test/fixtures/optional-storage-assignment.mjs";

for (const surface of [undefined, "js"]) {
  test(`optional field declarations retain native absence, widths and identity (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalStorageAssignmentSource });
    executeCsharpConstruction(compiled, `optional-storage-assignment-${surface ?? "native"}`);
  });
}
