import test from "node:test";
import { selectedLiteralInputsSource } from "../../../../tsonic/test/fixtures/selected-literal-inputs.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`selected literal inputs retain exact native carriers on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: selectedLiteralInputsSource }),
      `selected-literal-inputs-${surface ?? "native"}`);
  });
}
