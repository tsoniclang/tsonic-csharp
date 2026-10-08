import test from "node:test";
import { independentFrameAlternativesSource } from "../../../../tsonic/test/fixtures/independent-frame-alternatives.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) test(`independent frame alternatives preserve native aliases and callback identity in ${surface ?? "native"}`,
  { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: independentFrameAlternativesSource }),
      `independent-frame-alternatives-${surface ?? "native"}`);
  });
