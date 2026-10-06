import test from "node:test";
import { awaitOperandCallableSource } from "../../../../tsonic/test/fixtures/await-operand-callables.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`await operands close nested callable evidence and retain error identity in ${surface}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: awaitOperandCallableSource });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `await-operand-callables-${surface}`, true);
    });
}
