import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const [name, statement, discarded] of [
  ["discarded", "leaf();", 1],
  ["void", "void leaf();", 1],
  ["conditional", "flag ? leaf() : leaf();", 2],
  ["stored", "const pending = leaf(); return await pending;", 0],
  ["awaited", "return await leaf();", 0],
]) {
  test(`C# publishes the selected Promise result use: ${name}`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
      async function leaf(): Promise<number> { return 1; }
      export async function outer(flag: boolean): Promise<number> { ${statement} return 0; }
    ` });
    assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`), []);
    const results = compiled.result.program.promiseResults;
    assert.equal(results instanceof Map, true);
    assert.equal([...results.values()].filter(row => row.discard !== undefined).length, discarded);
    if (discarded > 0) assert.equal(compiled.result.program.binaryExecutionDriver?.id, "tsonic.csharp.js.event-loop-v1");
    for (const row of results.values()) assert.equal(Object.isFrozen(row), true);
  });
}

test("C# rejects a discarded native async call before publishing a program", () => {
  const compiled = compileCsharpSource({ sourceText: `
    async function leaf(): Promise<number> { return 1; }
    export function outer(): void { leaf(); }
  ` });
  assert.deepEqual(compiled.targetDiagnostics.map(diagnostic => diagnostic.code), ["TSONIC_NATIVE_ASYNC_RESULT_DISCARDED"]);
  assert.equal(compiled.result.program === undefined, true);
  assert.equal(compiled.result.artifacts.length, 0);
});
