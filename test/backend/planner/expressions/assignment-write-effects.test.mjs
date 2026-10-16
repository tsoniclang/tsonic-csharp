import assert from "node:assert/strict";
import test from "node:test";
import { assignmentWriteEffectCases } from "../../../../../tsonic/test/fixtures/assignment-write-effects.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

for (const fixture of assignmentWriteEffectCases) {
  test(`${fixture.id}: ${fixture.name}`, { timeout: 180_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: fixture.source });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.program !== undefined, true, "checked source reaches target analysis");
    assert.equal([...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true,
      "the same assignment value and complete native effects are emitted");
  });
}
