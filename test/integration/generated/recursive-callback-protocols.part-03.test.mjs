import test from "node:test";
import { recursiveCallbackProtocolCases } from "../../../../tsonic/test/fixtures/recursive-callback-protocols.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const current of Array.from(recursiveCallbackProtocolCases).slice(11, 18)) {
for (const profile of Array.from(["native", "js"]).slice(0, 2)) {
test(`${current.name} recursive callback protocol compiles and executes in ${profile}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: profile, sourceText: current.source });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `recursive-callback-${current.name}-${profile}`, false, false, [],
      "Tsonic.Generated.Index.main();");
  });
}
}
