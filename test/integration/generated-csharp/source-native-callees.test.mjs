import test from "node:test";
import { sourceNativeCalleeFiles } from "../../../../tsonic/test/fixtures/source-native-callees.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native callee selection preserves method dispatch, generics and lazy arguments in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: sourceNativeCalleeFiles["index.ts"],
      files: { "helper.ts": sourceNativeCalleeFiles["helper.ts"] } });
    executeCsharpConstruction(compiled, "source-native-callees", false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("native callee dispatch");
var counter = Tsonic.Generated.Index.create();
for (var index = 0; index < 100; index++) {
    if (Tsonic.Generated.Index.cost(counter) != 7) throw new System.Exception("native callee value");
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (Tsonic.Generated.Index.cost(counter) != 7) throw new System.Exception("native callee value");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("native method introduced allocation");
`);
  });
}
