import test from "node:test";
import { nullableStructuralResultFiles } from "../../../../tsonic/test/fixtures/nullable-structural-results.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`nullable structural and class results preserve selected storage on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nullableStructuralResultFiles["index.ts"],
      files: { "contracts.ts": nullableStructuralResultFiles["contracts.ts"] } });
    executeCsharpConstruction(compiled, `nullable-structural-results-${surface ?? "native"}`);
  });
}
