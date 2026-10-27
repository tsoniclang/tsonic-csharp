import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`a structural method destination retains every actual literal member on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
type Contract = { removed: number; run(value: number): number };
let order: string = "";
function mark(label: string, value: number): number { order = order + label; return value; }
function invoke(value: Contract): number { return value.run(value.removed); }
export function run(): boolean {
  const source = { extra: mark("a", 11), removed: mark("b", 3), run(value: number): number { return value + 7; } };
  const alias = source;
  const reordered = { run(value: number): number { return value + 2; }, removed: mark("c", 4), extra: mark("d", 13) };
  return invoke(source) === 10 && invoke(reordered) === 6 && source.extra === 11 &&
    reordered.extra === 13 && alias === source && order === "abcd";
}` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/\bextra\b/u.test(output), true, "the actual extra field is represented natively");
    assert.equal(/System\.Reflection|\.CreateDynamicObject\(|\.WriteDynamicSlot\(/u.test(output), false,
      "a structural interface demand does not replace the actual native object");
    executeCsharpConstruction(compiled, `literal-construction-members-${surface}`);
  });
}
