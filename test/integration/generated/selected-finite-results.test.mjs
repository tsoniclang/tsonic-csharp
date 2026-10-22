import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { selectedFiniteResultSource, selectedFiniteResultNativeProgram } from "../../helpers/selected-finite-results.mjs";

for (const surface of [undefined, "js"]) {
  test(`selected finite and optional call results preserve native identity, effects and uint64 (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: selectedFiniteResultSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `selected-finite-results-${surface ?? "native"}`, false, false, [], selectedFiniteResultNativeProgram);
  });
}
