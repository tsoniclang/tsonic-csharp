import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

import { discardedCallableDefinitionsSource as sourceText, retainedDefaultCallableSource } from "../../../../tsonic/test/fixtures/discarded-callable-definitions.mjs";

for (const surface of [undefined, "js"]) {
  test(`discarded definitions preserve captured initialization, invoked effects and zero native allocation (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `discarded-lambda-definitions-${surface ?? "native"}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("discarded definition effects");
double total = 0;
for (int index = 0; index < 1000; index++) total += Tsonic.Generated.Index.discarded(index);
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) total += Tsonic.Generated.Index.discarded(index);
long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (total != 50494500 || allocated != 0) throw new System.Exception("uninvoked definitions must not allocate");
`);
  });

  test(`discarded definitions still require valid source body checking (${surface ?? "native"})`, () => {
    const checked = checkCsharpSource({ surface, sourceText: `export function run(): boolean { (() => missingIdentifier); return true; }` });
    assert.equal(/Cannot find name.*missingIdentifier/u.test(checked.sourceDiagnosticsText), true, "discard does not suppress source errors");
  });

  test(`an absence default retains and invokes its required lambda (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: retainedDefaultCallableSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `retained-default-lambda-${surface ?? "native"}`);
  });
}
