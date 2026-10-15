import test from "node:test";
import { conditionalNativeAbsenceSource } from "../../../../tsonic/test/fixtures/conditional-native-absence.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`conditional native results retain complete absence and uint64 domains on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ sourceText: conditionalNativeAbsenceSource, surface }),
      "conditional-native-absence");
  });
}
