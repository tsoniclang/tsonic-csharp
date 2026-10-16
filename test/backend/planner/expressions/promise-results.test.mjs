import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

for (const [name, statement, observed] of [
  ["ordinary", "leaf();", 1],
  ["void", "void leaf();", 1],
  ["conditional", "flag ? leaf() : leaf();", 2],
  ["reaction", "leaf().then(value => value + 1);", 1],
  ["stored", "const pending = leaf(); return await pending;", 0],
]) {
  test(`C# renders exactly one observer per selected ${name} discarded producer`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
      async function leaf(): Promise<number> { return 1; }
      export async function outer(flag: boolean): Promise<number> { ${statement} return 0; }
    ` });
    assert.deepEqual(compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`), []);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal((output.match(/PromiseRuntime\.ObserveDiscarded\(/gu) ?? []).length, observed, output);
    assert.equal(output.includes("Task.Run("), false, output);
  });
}
