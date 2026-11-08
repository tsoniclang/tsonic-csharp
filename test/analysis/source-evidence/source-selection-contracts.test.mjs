import assert from "node:assert/strict";
import test from "node:test";
import { booleanValueShortCircuitSource } from "../../../../tsonic/test/fixtures/boolean-value-short-circuit.mjs";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { assertPublishedRefusal, compileEffectiveSource } from "../../helpers/source-effective-types.mjs";

test("the original lazy width/effect fixture publishes exact control identities and Source-owned dispositions", () => {
  const compiled = analyzeCsharpSource({ sourceText: booleanValueShortCircuitSource });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", compiled.analysis.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join("; ").slice(0, 1600));
  const source = compiled.analysis.value.source;
  const ast = source.ast;
  const operations = new Map();
  const names = new Map([
    ["KindAmpersandAmpersandToken", "and"], ["KindBarBarToken", "or"], ["KindQuestionQuestionToken", "coalesce"],
  ]);
  const text = node => {
    const range = ast.authoredRange(node);
    assert.equal(range.kind, "authored", "the actual original operation is authored");
    return ast.getSourceText(ast.getSourceFile(node)).slice(range.start, range.end);
  };
  for (const occurrence of source.facts.values.occurrences()) {
    const conditional = ast.is.IsConditionalExpression(occurrence);
    const binary = ast.is.IsBinaryExpression(occurrence);
    const kind = conditional ? "conditional" : binary ? names.get(ast.operatorKindName(occurrence)) : undefined;
    if (kind === undefined) continue;
    const operation = resolvedSourceValue(source.facts.values.operation(occurrence), "the original selected-value operation");
    assert.equal(operation.kind, kind);
    assert.equal(operation.occurrence === occurrence && operation.result !== undefined, true, "the complete operation retains its original use and result");
    source.facts.descriptors.assertEvidence(operation.result);
    const control = conditional ? ast.as.AsConditionalExpression(occurrence).Condition : ast.as.AsBinaryExpression(occurrence).Left;
    assert.equal(operation.control.occurrence === control, true, "the sole evaluation control is the exact original operand, including comma effects");
    source.facts.descriptors.assertEvidence(operation.control.value);
    if (conditional) {
      const original = ast.as.AsConditionalExpression(occurrence);
      assert.equal(operation.whenTrue.occurrence === original.WhenTrue && operation.whenFalse.occurrence === original.WhenFalse, true,
        "both original alternatives stay distinct from their execution disposition");
    } else if (kind === "and") {
      assert.equal(operation.whenTrue.occurrence === ast.as.AsBinaryExpression(occurrence).Right && operation.whenFalse === "control-false", true,
        "and preserves the selected RHS and original false control value");
    } else if (kind === "or") {
      assert.equal(operation.whenFalse.occurrence === ast.as.AsBinaryExpression(occurrence).Right && operation.whenTrue === "control-true", true,
        "or preserves the selected RHS and original true control value");
    }
    const originalText = text(occurrence);
    const prior = operations.get(originalText) ?? [];
    prior.push(operation);
    operations.set(originalText, prior);
  }
  for (const [expression, disposition] of [
    ["false && next()", "left"], ["true || next()", "left"], ["true && next()", "right"],
    ["(next(), false) || next()", "right"], ["enabled && next()", "dynamic"], ["enabled || next()", "dynamic"],
  ]) {
    const selected = operations.get(expression) ?? [];
    assert.equal(selected.length, 1, `one unchanged original expression ${expression}`);
    assert.equal(selected[0].disposition, disposition, `${expression}: only Source chooses the disposition`);
  }
});

test("present-left coalesce remains the exact held Source refusal rather than publishing a left disposition", () => {
  const compiled = compileEffectiveSource("native", `export function choose(value: number): number { return value ?? 1; }`);
  assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_UNSUPPORTED", "value ?? 1");
});
