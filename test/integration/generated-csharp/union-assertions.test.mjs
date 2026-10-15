import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { unionAssertionSource } from "../../../../tsonic/test/fixtures/union-assertions.mjs";

for (const surface of [undefined, "js"]) {
  test(`explicit union projections retain exact native arms on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: unionAssertionSource });
    executeCsharpConstruction(compiled, "union-assertions");
  });
}
