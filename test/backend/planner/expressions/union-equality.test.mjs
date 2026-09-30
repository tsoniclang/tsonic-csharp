import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpUnionEquality } from "../../../../dist/policy/operations/operators/union-equality.js";
import { planCsharpUnionEquality } from "../../../../dist/backend/planner/expressions/union-equality.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../dist/target-model/types/index.js";

test("union equality rejects stale carriers, paths, operations, coverage and polarity", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const policy = { providers: { findTargetBindingByTargetId() {} }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const arms = selectCsharpUnionEquality(union, string, policy);
  const operation = { kind: "union-equality", negated: false, arms };
  const selection = { kind: "resolved", sourceOperator: "===", targetOperation: operation,
    left: {}, right: {}, leftType: union, rightType: string, resultType: csharpSourcePrimitiveTargetType("bool") };
  const input = { program: { operations: { binary: () => ({ target: selection }) } }, scope: {} };
  const diagnostics = [];
  const state = () => ({ nextTempIndex: 0, usedNames: new Set() });
  const plan = () => ({ kind: "IdentifierName", name: "operand" });
  const planned = planCsharpUnionEquality({}, selection, {}, input, diagnostics, plan, state());
  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "SwitchExpression");
  assert.equal(planned.expression.elements.length, 2);
  for (const mutation of [
    { left: {} }, { leftType: string }, { rightType: integer }, { resultType: integer },
    { sourceOperator: "!==" },
    ...[undefined, null, [], [null], [{ ...arms[0], left: null }], [{ ...arms[0], operation: null }],
      [{ ...arms[0], operation: { kind: "operator" } }],
      [...arms, arms[0]], [{ ...arms[0], left: { ...arms[0].left, path: [] } }],
      [{ ...arms[0], operation: { kind: "reference-identity", negated: false } }]].map(arms =>
      ({ targetOperation: { ...operation, arms } })),
    { targetOperation: { ...operation, negated: true } },
  ]) {
    diagnostics.length = 0;
    assert.equal(planCsharpUnionEquality({}, { ...selection, ...mutation }, {}, input, diagnostics, () => {
      assert.fail("invalid classification cannot plan operands");
    }, state()), undefined);
    assert.equal(diagnostics.length, 1);
  }
});
