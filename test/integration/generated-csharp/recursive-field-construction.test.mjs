import test from "node:test";
import { recursiveFieldConstructionSource } from "../../../../tsonic/test/fixtures/recursive-field-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) test(`recursive field transport preserves constructor invocation and identity in ${surface ?? "native"}`,
  { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: recursiveFieldConstructionSource }),
      `recursive-field-construction-${surface ?? "native"}`);
  });
