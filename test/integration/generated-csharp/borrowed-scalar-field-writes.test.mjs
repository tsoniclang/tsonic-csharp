import assert from "node:assert/strict";
import test from "node:test";
import { borrowedScalarFieldWritesSource, borrowedScalarFieldFreezeSource, ordinaryScalarFieldWritesSource,
  ownedFieldSnapshotSource, ownedFieldSnapshotRunSource } from "../../../../tsonic/test/fixtures/borrowed-scalar-field-writes.mjs";
import { receiverFieldCaptureEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  const projected = receiverFieldCaptureEdges.find(example => example.name === "projected-fields");
  assert.equal(projected !== undefined, true, "shared captured Point source exists");
  for (const [name, source] of [
    ["projected-point", projected.source],
    ["captured-scalar-order", borrowedScalarFieldWritesSource],
    ["ordinary-scalar-order", ordinaryScalarFieldWritesSource],
    ["owned-snapshot-order", ownedFieldSnapshotSource + ownedFieldSnapshotRunSource],
  ]) test(`native child field writes retain source selection and order: ${name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: source +
      '\nexport function main(): void { if (!run()) throw new Error("native child field write"); }' });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\bdynamic\b|Unsafe\.|GetProperty|Activator/u);
    executeCsharpConstruction(compiled, `borrowed-field-${name}-${surface}`);
  });
}

test("captured child writes preserve native freeze rejection", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: borrowedScalarFieldWritesSource + borrowedScalarFieldFreezeSource +
    '\nexport function main(): void { if (!run() || !frozenWrite()) throw new Error("native child freeze"); }' });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "borrowed-field-freeze");
});
