import test from "node:test";
import { inferredDefaultParameterSource } from "../../../../tsonic/test/fixtures/inferred-default-parameters.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`inferred defaults retain exact values and conditional effects in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: inferredDefaultParameterSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `inferred-defaults-${lane}`);
  });
}
