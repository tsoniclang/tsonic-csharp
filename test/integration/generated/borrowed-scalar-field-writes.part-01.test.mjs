import assert from "node:assert/strict";
import test from "node:test";
import { borrowedScalarFieldWritesSource, borrowedScalarFieldFreezeSource, ordinaryScalarFieldWritesSource,
  ownedFieldSnapshotSource, ownedFieldSnapshotRunSource } from "../../../../tsonic/test/fixtures/borrowed-scalar-field-writes.mjs";
import { receiverFieldCaptureEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
const projected = receiverFieldCaptureEdges.find(example => example.name === "projected-fields");

assert.equal(projected !== undefined, true, "shared captured Point source exists");

for (const [name, source] of Array.from([
    ["projected-point", projected.source],
    ["captured-scalar-order", borrowedScalarFieldWritesSource],
    ["ordinary-scalar-order", ordinaryScalarFieldWritesSource],
    ["owned-snapshot-order", ownedFieldSnapshotSource + ownedFieldSnapshotRunSource],
  ]).slice(0, 4)) {
test(`native child field writes retain source selection and order: ${name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: source +
      '\nexport function main(): void { if (!run()) throw new Error("native child field write"); }' });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\bdynamic\b|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `borrowed-field-${name}-${surface}`);
  });
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
test(`native child field writes retain source selection and order: ${name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: source +
      '\nexport function main(): void { if (!run()) throw new Error("native child field write"); }' });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\bdynamic\b|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `borrowed-field-${name}-${surface}`);
  });
}
}
