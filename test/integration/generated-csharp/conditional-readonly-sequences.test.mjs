import test from "node:test";
import { conditionalReadonlySequencesSource } from "../../../../tsonic/test/fixtures/conditional-readonly-sequences.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`conditional readonly sequences retain exact narrowing and lazy fallback on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: conditionalReadonlySequencesSource }),
      "conditional-readonly-sequences");
  });
}
