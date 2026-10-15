import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeUnaryLocationsSource } from "../../../../tsonic/test/fixtures/native-unary-locations.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} unary locations retain native values, aliasing, evaluation count and allocation`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeUnaryLocationsSource });
    const output = executeCsharpConstruction(compiled, `unary-locations-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
if (!Subject.run()) throw new System.Exception("native update values, alias identity or key evaluation");
for (int iteration = 0; iteration < 10000; iteration++) _ = Subject.local(iteration);
long before = System.GC.GetAllocatedBytesForCurrentThread();
long total = 0;
for (int iteration = 0; iteration < 10000; iteration++) total += Subject.local(iteration);
if (total != 150025000 || System.GC.GetAllocatedBytesForCurrentThread() != before)
    throw new System.Exception("native direct integer update value or allocation");
System.Console.WriteLine("native unary locations: correct; zero allocated bytes");
`);
    assert.equal(output.trim(), "native unary locations: correct; zero allocated bytes");
  });
}
