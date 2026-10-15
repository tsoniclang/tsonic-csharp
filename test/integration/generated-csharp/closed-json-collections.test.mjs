import test from "node:test";
import { closedJsonCollectionSource } from "../../../../tsonic/test/fixtures/closed-json-collections.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("closed JSON collections preserve exact values across broad parameters without backing adapters", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: closedJsonCollectionSource }),
    "closed-json-collections", false, false, [], "Tsonic.Generated.Index.run();");
});
