import assert from "node:assert/strict";
import test from "node:test";
import { borrowedScalarFieldWritesSource, borrowedScalarFieldFreezeSource, ordinaryScalarFieldWritesSource,
  ownedFieldSnapshotSource, ownedFieldSnapshotRunSource } from "../../../../tsonic/test/fixtures/borrowed-scalar-field-writes.mjs";
import { receiverFieldCaptureEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNumericLiteralRefusal, numericCarrierRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
const projected = receiverFieldCaptureEdges.find(example => example.name === "projected-fields");

assert.equal(projected !== undefined, true, "shared captured Point source exists");

for (const [name, source] of Array.from([
    ["projected-point", projected.source],
    ["captured-scalar-order", borrowedScalarFieldWritesSource],
    ["ordinary-scalar-order", ordinaryScalarFieldWritesSource],
    ["owned-snapshot-order", ownedFieldSnapshotSource + ownedFieldSnapshotRunSource],
  ]).slice(0, 4)) {
for (const ownNumber of name === "ordinary-scalar-order" ? [false, true] : [false]) {
test(ownNumber ? `native own-number child field writes retain source selection and order: ${name} in ${surface}`
  : `native child field writes retain source selection and order: ${name} in ${surface}`, { timeout: 300_000 }, () => {
    const sourceText = ownNumber ? source.replaceAll("count = 0;", "count: number = 0;") : source;
    const compiled = compileCsharpSource({ surface, sourceText: sourceText +
      '\nexport function main(): void { if (!run()) throw new Error("native child field write"); }' });
    if (name === "ordinary-scalar-order" && !ownNumber) {
      assertNumericLiteralRefusal(compiled, ["value", "value"].map(text =>
        numericCarrierRefusal(csharpSourcePrimitiveTargetType("float64"), csharpSourcePrimitiveTargetType("int64"), text)));
      return;
    }
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\bdynamic\b|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `borrowed-field-${name}-${surface}`);
  });
}
}
}

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
const projected = receiverFieldCaptureEdges.find(example => example.name === "projected-fields");

assert.equal(projected !== undefined, true, "shared captured Point source exists");

for (const [name, source] of Array.from([
    ["projected-point", projected.source],
    ["captured-scalar-order", borrowedScalarFieldWritesSource],
    ["ordinary-scalar-order", ordinaryScalarFieldWritesSource],
    ["owned-snapshot-order", ownedFieldSnapshotSource + ownedFieldSnapshotRunSource],
  ]).slice(0, 3)) {
for (const ownNumber of name === "ordinary-scalar-order" ? [false, true] : [false]) {
test(ownNumber ? `native own-number child field writes retain source selection and order: ${name} in ${surface}`
  : `native child field writes retain source selection and order: ${name} in ${surface}`, { timeout: 300_000 }, () => {
    const sourceText = ownNumber ? source.replaceAll("count = 0;", "count: number = 0;") : source;
    const compiled = compileCsharpSource({ surface, sourceText: sourceText +
      '\nexport function main(): void { if (!run()) throw new Error("native child field write"); }' });
    if (name === "ordinary-scalar-order" && !ownNumber) {
      assertNumericLiteralRefusal(compiled, ["value", "value"].map(text =>
        numericCarrierRefusal(csharpSourcePrimitiveTargetType("float64"), csharpSourcePrimitiveTargetType("int64"), text)));
      return;
    }
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\bdynamic\b|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `borrowed-field-${name}-${surface}`);
  });
}
}
}
