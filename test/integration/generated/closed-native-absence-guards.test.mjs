import test from "node:test";
import { closedNativeAbsenceGuardSource } from "../../../../tsonic/test/fixtures/closed-native-absence-guards.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`closed native absence guards preserve parameter, local, optional member and runtime category in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: closedNativeAbsenceGuardSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `closed-native-absence-guards-${surface}`);
  });
}
