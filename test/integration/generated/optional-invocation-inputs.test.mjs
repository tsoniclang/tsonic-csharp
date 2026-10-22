import test from "node:test";
import { optionalInvocationInputsSource } from "../../../../tsonic/test/fixtures/optional-invocation-inputs.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`optional invocation inputs retain exact native width, loans and laziness in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalInvocationInputsSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `optional-invocation-inputs-${lane}`);
  });
}
