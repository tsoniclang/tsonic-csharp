import test from "node:test";
import { booleanValueShortCircuitSource } from "../../../../tsonic/test/fixtures/boolean-value-short-circuit.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`native short-circuit execution retains branch order, one absence and exact width in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: booleanValueShortCircuitSource });
    executeCsharpConstruction(compiled, "boolean-value-short-circuit", false, false, [], `
for (var index = 0; index < 100; index++) {
    if (!Tsonic.Generated.Index.run(true) || !Tsonic.Generated.Index.run(false)) throw new System.Exception("short-circuit result");
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (!Tsonic.Generated.Index.run(true) || !Tsonic.Generated.Index.run(false)) throw new System.Exception("short-circuit result");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("short-circuit introduced allocation");
`);
  });
}
