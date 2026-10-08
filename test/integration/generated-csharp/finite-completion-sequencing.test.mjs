import test from "node:test";
import { finiteCompletionSequencingExecutionSource } from "../../../../tsonic/test/fixtures/finite-completion-sequencing.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("finite suspended inputs preserve order, laziness, absence, live captures and error identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: finiteCompletionSequencingExecutionSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "finite-completion-sequencing", true, false, [],
    "await Tsonic.Generated.Index.main();");
});
