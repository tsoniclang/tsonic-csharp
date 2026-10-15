import test from "node:test";
import { recordAliasForwardingFiles, recordAliasListenerFiles } from "../../../../tsonic/test/fixtures/record-alias-forwarding.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`record alias forwarding retains indexed storage on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: recordAliasForwardingFiles["index.ts"], files: recordAliasForwardingFiles });
    executeCsharpConstruction(compiled, `record-alias-forwarding-${surface ?? "native"}`);
  });
}

test("record aliases retain generic rest-callable array storage on JS", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: recordAliasListenerFiles["index.ts"], files: recordAliasListenerFiles });
  executeCsharpConstruction(compiled, "record-alias-listeners-js");
});
