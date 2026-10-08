import test from "node:test";
import { recursiveCallbackEnvironmentSource } from "../../../../tsonic/test/fixtures/recursive-callback-environments.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`escaped generic class callbacks retain aliases and mutation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: recursiveCallbackEnvironmentSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `recursive-callback-environments-${surface}`);
  });
}
