import assert from "node:assert/strict";

export function assertNativeErrorWriteRefusals(compiled, writes) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the complete original source is checked");
  assert.equal(compiled.result.diagnostics.length, writes.length, "every original Error write has one local refusal");
  const selectedWrites = [];
  for (const diagnostic of compiled.result.diagnostics) {
    assert.equal(diagnostic.code, "CSHARP_ERROR_READONLY_STORAGE");
    assert.equal(diagnostic.message,
      "C# exceptions are immutable after construction; create a new Error or pass the message to super instead.");
    assert.equal(diagnostic.sourceNode !== undefined, true, "the actual checked write owns its refusal");
    selectedWrites.push(compiled.source.ast.text(diagnostic.sourceNode));
  }
  assert.deepEqual(selectedWrites.sort(), [...writes].sort(), "the exact original checked writes are retained without inventing cross-file diagnostic order");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
    true, "an invalid Error write never publishes target facts or source");
}
