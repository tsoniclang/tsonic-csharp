import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpUnionEquality } from "../../../../dist/policy/operations/operators/union-equality.js";
import { planCsharpUnionEquality } from "../../../../dist/backend/planner/expressions/union-equality.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";
import { printCsharpExpression } from "../../../../dist/print/source/printer.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { analyzeCsharpUnionEquality } from "../../../../dist/analysis/operations/union-equality.js";
import { csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";

// The union equality the analysis seals for one binary node, and the planning context that reads it.
function sealed(node, selection) {
  return analyzeCsharpUnionEquality([node], { binaryOperation: { get: subject => subject === node ? { target: selection } : undefined } });
}
function planning(analysis) {
  return { program: { source: { ast: { pos: () => 0 } }, records: { unionEquality: analysis.records.unionEquality,
    typeEmission: csharpTypeEmissionRecord(), nativeConstant: { get: () => false }, nativeAbsence: { get: () => false } } },
  scope: {}, names: { temporaryName: name => name } };
}

test("union equality rejects stale carriers, paths, operations, coverage and polarity", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const policy = { providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const arms = selectCsharpUnionEquality(union, string, policy);
  const operation = { kind: "union-equality", negated: false, arms };
  const selection = { kind: "resolved", sourceOperator: "===", targetOperation: operation,
    left: {}, right: {}, leftType: union, rightType: string, resultType: csharpSourcePrimitiveTargetType("bool") };
  const node = {};
  const analysis = sealed(node, selection);
  assert.deepEqual(analysis.issues, []);
  const input = planning(analysis);
  const diagnostics = [];
  const state = () => ({ nextTempIndex: 0, usedNames: new Set() });
  const plan = node => csharpPlannedValue(node === selection.left ? union : string,
    { kind: "IdentifierName", name: "operand" });
  const planned = planCsharpUnionEquality(node, selection, {}, input, diagnostics, plan, state());
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.completion.expression.kind, "SwitchExpression");
  assert.equal(planned.completion.expression.expression.elements.length, 2);
  assert.deepEqual(planned.prelude, []);
  // The analysis seals union equality from the operation classification and refuses a result carrier or polarity that
  // disagrees with it; the planner no longer re-validates the sealed classification's carriers, paths or arms.
  for (const mutation of [{ resultType: integer }, { sourceOperator: "!==" }, { targetOperation: { ...operation, negated: true } }]) {
    const refused = sealed(node, { ...selection, ...mutation });
    assert.equal(refused.issues.length, 1);
    assert.equal(refused.records.unionEquality.get(node), undefined, "a refused equality publishes no plan");
  }
});

test("nullable union equality plans canonical native presence guards with each operand evaluated once in order", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const text = csharpStringTargetType();
  const base = csharpTargetNamedType("fixture.Base", [], { kind: "named", name: "Base" }, { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class" });
  const policy = { providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const union = csharpNullableTargetType(csharpRuntimeUnionTargetType([integer, text, base]));
  for (const rightType of [union, csharpNullableTargetType(text), csharpNullableTargetType(base), integer]) {
    const arms = selectCsharpUnionEquality(union, rightType, policy);
    assert.ok(arms !== undefined);
    for (const negated of [false, true]) {
      const left = {};
      const right = {};
      const selection = { kind: "resolved", sourceOperator: negated ? "!==" : "===",
        targetOperation: { kind: "union-equality", negated, arms }, left, right, leftType: union, rightType,
        resultType: csharpSourcePrimitiveTargetType("bool") };
      const node = {};
      const analysis = sealed(node, selection);
      assert.deepEqual(analysis.issues, []);
      const input = planning(analysis);
      const seen = [];
      const diagnostics = [];
      const planned = planCsharpUnionEquality(node, selection, {}, input, diagnostics, node => {
        seen.push(node);
        return csharpPlannedValue(node === left ? union : rightType, { kind: "InvocationExpression",
          callee: { kind: "IdentifierName", name: node === left ? "produceLeft" : "produceRight" }, arguments: [] });
      }, { nextTempIndex: 0, usedNames: new Set() });
      assertNoTargetDiagnostics(diagnostics);
      assert.deepEqual(seen, [left, right]);
      assert.deepEqual(planned.prelude, []);
      const output = printCsharpExpression(planned.completion.expression);
      assert.equal(output.match(/produceLeft\(\)/gu)?.length, 1);
      assert.equal(output.match(/produceRight\(\)/gu)?.length, 1);
      assert.ok(output.indexOf("produceLeft()") < output.indexOf("produceRight()"));
      assert.match(output, /\.Item1\?\.Is\d\(\) == true/u);
      assert.match(output, /\.Item1!\.Value\.As\d\(\)/u);
      if (rightType !== integer) assert.match(output, /\.Item1 is null.*\.Item2 is null/u);
      if (rightType !== union && rightType !== integer) assert.match(output, /\.Item2 is (?:string|Base) /u);
      assert.doesNotMatch(output, /\bnew\b|\bClone\b|\bDynamicInvoke\b|\(object\)|\.ToArray\(|\.ToList\(/u);
      if (negated) assert.match(output, /^!/u);
    }
  }
});
