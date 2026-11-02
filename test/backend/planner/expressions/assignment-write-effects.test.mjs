import assert from "node:assert/strict";
import test from "node:test";
import { assignmentWriteEffectCases } from "../../../../../tsonic/test/fixtures/assignment-write-effects.mjs";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { assertNumericLiteralRefusal, numericCarrierRefusal } from "../../../helpers/numeric-literal-rulings.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";

for (const fixture of assignmentWriteEffectCases) {
  for (const ownNumber of fixture.id === "W2" || fixture.id === "W3" ? [false, true] : [false]) {
  test(ownNumber ? `${fixture.id}: own-number storage retains ${fixture.name}`
    : `${fixture.id}: ${fixture.name}`, { timeout: 180_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: ownNumber
      ? fixture.source.replace("value = 3;", "value: number = 3;") : fixture.source });
    if ((fixture.id === "W2" || fixture.id === "W3") && !ownNumber) {
      assertNumericLiteralRefusal(compiled, [numericCarrierRefusal(csharpSourcePrimitiveTargetType("float64"),
        csharpSourcePrimitiveTargetType("int64"), fixture.id === "W2" ? "operand()" : "value")]);
      return;
    }
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
}
