import test from "node:test";
import { receiverOwnerCaptures } from "../../../../tsonic/test/fixtures/receiver-owner-captures.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const example of receiverOwnerCaptures) for (const surface of ["native", "js"]) {
  test(`retained native receiver ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-owner-${example.name}-${surface}`, example.asynchronous);
  });
}
