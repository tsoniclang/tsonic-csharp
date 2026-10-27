import test from "node:test";
import { receiverOwnerCaptures } from "../../../../tsonic/test/fixtures/receiver-owner-captures.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const example of Array.from(receiverOwnerCaptures).slice(4, 8)) {
for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`retained native receiver ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-owner-${example.name}-${surface}`, example.asynchronous);
  });
}
}
