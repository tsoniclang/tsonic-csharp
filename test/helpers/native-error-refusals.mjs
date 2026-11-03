import assert from "node:assert/strict";
import { createTargetSourceProgram } from "@tsonic/target-api/source";

export function nativeErrorDiagnosticText(compiled, diagnostic) {
  const source = createTargetSourceProgram(compiled.source);
  const nodes = new Set();
  const visit = node => {
    nodes.add(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  const node = diagnostic.sourceNode;
  assert.equal(node !== undefined && nodes.has(node), true, "the identical checked source node owns the refusal");
  const range = source.ast.authoredRange(node);
  assert.equal(range.kind, "authored", "the refusal retains its original authored range");
  const text = source.ast.getSourceText(source.ast.getSourceFile(node));
  assert.equal(range.start >= 0 && range.end >= range.start && range.end <= text.length, true,
    "the complete node range belongs to the actual checked source file");
  return text.slice(range.start, range.end);
}

export function assertNativeErrorWriteRefusals(compiled, writes) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the complete original source is checked");
  assert.equal(compiled.result.diagnostics.length, writes.length, "every original Error write has one local refusal");
  const selectedWrites = compiled.result.diagnostics.map(diagnostic => {
    assert.equal(diagnostic.code, "CSHARP_ERROR_READONLY_STORAGE");
    assert.equal(diagnostic.message,
      "C# exceptions are immutable after construction; create a new Error or pass the message to super instead.");
    return nativeErrorDiagnosticText(compiled, diagnostic);
  });
  assert.deepEqual(selectedWrites.sort(), [...writes].sort(),
    "the exact checked writes remain, without inventing cross-file diagnostic order");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
    true, "a refused Error write publishes no target facts or source");
}
