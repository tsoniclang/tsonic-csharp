import assert from "node:assert/strict";
import test from "node:test";
import { assignmentWriteEffectCases } from "../../../../../tsonic/test/fixtures/assignment-write-effects.mjs";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

for (const fixture of assignmentWriteEffectCases) {
  test(`${fixture.id}: ${fixture.name}`, { timeout: 180_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: fixture.source });
    assert.equal(compiled.sourceDiagnosticsText.length, 0, `${fixture.id}: no source diagnostics`);
    assert.equal(Array.isArray(compiled.extensionDiagnostics), true, `${fixture.id}: extension diagnostics are an array`);
    assert.equal(compiled.extensionDiagnostics.length, 0, `${fixture.id}: no extension diagnostics`);
    assert.equal(Array.isArray(compiled.result.diagnostics), true, `${fixture.id}: target diagnostics are an array`);
    assert.equal(compiled.result.diagnostics.length, 0, `${fixture.id}: no target diagnostics`);
    assert.equal(compiled.result.program !== undefined, true, "checked source reaches target analysis");
    assert.equal([...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true,
      "the same assignment value and complete native effects are emitted");
  });
}
