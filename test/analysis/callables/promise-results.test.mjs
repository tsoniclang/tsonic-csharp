import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramPromiseResults } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const [name, statement, discarded] of [
  ["discarded", "leaf();", 1],
  ["void", "void leaf();", 1],
  ["conditional", "flag ? leaf() : leaf();", 2],
  ["stored", "const pending = leaf(); return await pending;", 0],
  ["awaited", "return await leaf();", 0],
]) {
  test(`C# publishes the selected Promise result use: ${name}`, () => {
    // Executable output: its startup record carries the selected binary execution driver (a library has none).
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
      async function leaf(): Promise<number> { return 1; }
      export async function outer(flag: boolean): Promise<number> { ${statement} return 0; }
    ` });
    assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`), []);
    const results = csharpProgramPromiseResults(compiled.result.program);
    assert.equal(results.length > 0, true, "the result-use owner publishes the decisions");
    assert.equal(results.filter(row => row.discard !== undefined).length, discarded);
    if (discarded > 0) assert.equal(compiled.result.program.records.startup.get().driver?.id, "tsonic.csharp.js.event-loop-v1");
    for (const row of results) assert.equal(Object.isFrozen(row), true);
  });
}

test("C# publishes a native eager Task discard without rejection observation", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ targetOptions: { outputType: "Exe" }, sourceText: `
    let starts = 0;
    async function leaf(): Promise<number> { starts += 1; return 1; }
    export function outer(): void { leaf(); }
    outer();
    if (starts !== 1) throw new Error("native eager Task body");
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the exact native discard is checked source");
  assert.deepEqual(compiled.targetDiagnostics.map(diagnostic => diagnostic.code), []);
  assert.equal(compiled.result.program !== undefined, true, "native eager result dropping is admitted before publication");
  const results = csharpProgramPromiseResults(compiled.result.program);
  assert.equal(results.filter(row => row.disposition.kind === "discarded").length, 1, "the actual call has one native discard");
  assert.equal(results.every(row => row.discard === undefined), true, "native discard never claims to observe rejection");
  assert.equal(compiled.result.program.records.startup.get().driver === undefined, true, "native Task drop needs no JS loop owner");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /_ = global::Tsonic\.Generated\.Index\.leaf\(\)/u);
  assert.doesNotMatch(output, /ObserveDiscarded|PromiseRuntime|Task\.Run|Wait\(|\.Result\b/u);
  executeCsharpConstruction(compiled, "native-task-drop-no-loop");
});
