import assert from "node:assert/strict";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "./direct-csharp-session.mjs";
import { resolvedSourceValue } from "./published-return-contracts.mjs";

export function checkedSourceScalarLiterals(expressions) {
  const compiled = analyzeCsharpSource({
    sourceText: expressions.map((text, index) => `export const value${index} = (${text});`).join("\n"),
  });
  assertCsharpCheckingSucceeded(compiled);
  const source = compiled.source;
  const files = source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file));
  assert.equal(files.length, 1, "one actual authored fixture file is enrolled in the Source program");
  const occurrences = new Set(source.facts.values.occurrences());
  const initializers = [];
  const visit = node => {
    if (source.ast.is.IsVariableDeclaration(node)) {
      const initializer = source.ast.as.AsVariableDeclaration(node).Initializer;
      assert.equal(initializer !== undefined, true, "each original fixture declaration has its authored initializer");
      initializers.push(initializer);
      return;
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(files[0]);
  assert.equal(initializers.length, expressions.length, "each original expression has exactly one checked initializer in authored order");
  return Object.freeze(initializers.map((node, index) => {
    assert.equal(occurrences.has(node), true, `literal ${index}: the original initializer is in the complete value domain`);
    const value = resolvedSourceValue(source.facts.values.type(node), `literal ${index}: original Source evidence`);
    source.facts.descriptors.assertEvidence(value);
    const scalar = source.facts.descriptors.scalarLiteral(value);
    assert.equal(scalar.kind, "present", `literal ${index}: one genuine same-view scalar is required`);
    assert.equal(Object.isFrozen(scalar.value), true, `literal ${index}: canonical scalar data is immutable`);
    return scalar.value;
  }));
}
