import test from "node:test";
import { publicFrameInputsSource } from "../../../../tsonic/test/fixtures/public-frame-inputs.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) test(`public type-query frame inputs preserve native owners in ${surface ?? "native"}`,
  { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: publicFrameInputsSource }),
      `public-frame-inputs-${surface ?? "native"}`);
  });
