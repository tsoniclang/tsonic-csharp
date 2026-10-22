import test from "node:test";
import { authoredBroadOverloadsSource } from "../../../../tsonic/test/fixtures/authored-broad-overloads.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`authored broad overloads preserve native class identity on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: authoredBroadOverloadsSource }),
      `authored-broad-overloads-${surface ?? "native"}`);
  });
}
