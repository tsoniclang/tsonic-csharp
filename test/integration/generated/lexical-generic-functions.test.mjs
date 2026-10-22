import test from "node:test";
import { lexicalGenericFunctionsSource } from "../../../../tsonic/test/fixtures/lexical-generic-functions.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native lexical generics retain outer binders, transitive captures and shadowing in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: lexicalGenericFunctionsSource });
    executeCsharpConstruction(compiled, "lexical-generic-functions", false, false, [], `
for (var index = 0; index < 100; index++) {
    if (Tsonic.Generated.Index.run() != 23) throw new System.Exception("lexical generic result");
}
if (Tsonic.Generated.Index.readKeeper(19) != 19) throw new System.Exception("generic member result");
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (Tsonic.Generated.Index.run() != 23) throw new System.Exception("lexical generic result");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("lexical generic introduced allocation");
`);
  });
}
