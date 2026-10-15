import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { optionalSwitchSource } from "../../../../tsonic/test/fixtures/optional-switch.mjs";

for (const surface of [undefined, "js"]) {
  test(`optional switch preserves native equality and ordered effects on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: optionalSwitchSource }), "optional-switch");
  });
}
