import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { moduleBindingPatternFiles } from "../../../../tsonic/test/fixtures/module-binding-patterns.mjs";

for (const surface of [undefined, "js"]) {
  test(`module patterns preserve roots, leaves, defaults, exports and live aliases on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files: moduleBindingPatternFiles,
      sourceText: moduleBindingPatternFiles["index.ts"], targetOptions: { outputType: "Exe" } });
    assert.equal(compiled.result.diagnostics.length, 0,
      compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join("\n").slice(0, 4096));
    assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true,
      "the identical full semantic module class seals and plans");
    executeCsharpConstruction(compiled, `module-binding-patterns-${surface ?? "native"}`);
  });

  test(`invalid module projection is refused before sealing on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let key = "value" as const;
const { [key]: value } = { value: 1 };
export function run(): number { return value; }
` });
    assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error"), true,
      "a nonconstant module projection retains its native source-key refusal");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "invalid projection cannot be sealed");
    assert.equal(compiled.artifacts.size, 0, "no partial native artifact is emitted");
  });
}
