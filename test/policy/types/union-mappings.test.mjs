import assert from "node:assert/strict";
import test from "node:test";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpRuntimeUnionTargetType, csharpNullableTargetType } from "../../../dist/target-model/types/index.js";
import { selectCsharpUnionArmMapping } from "../../../dist/target-model/types/union-relations.js";
import { selectCsharpConversion, selectCsharpFlowReadConversion } from "../../../dist/policy/conversions/index.js";
import { planCsharpUnionMapping } from "../../../dist/backend/planner/expressions/union-mappings.js";

test("union mappings require complete exact coverage and reject forged or numeric-changing arms", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const narrow = csharpRuntimeUnionTargetType([string, integer]);
  const wide = csharpRuntimeUnionTargetType([integer, boolean, string]);
  const wrong = csharpRuntimeUnionTargetType([string, csharpSourcePrimitiveTargetType("float64")]);
  const widening = selectCsharpUnionArmMapping(narrow, wide, "source");
  const narrowing = selectCsharpUnionArmMapping(wide, narrow, "target");
  assert.deepEqual(widening.map(arm => [arm.source, arm.target]), [[0, 2], [1, 0]]);
  assert.deepEqual(narrowing.map(arm => [arm.source, arm.target]), [[0, 1], [2, 0]]);
  assert.equal(selectCsharpUnionArmMapping(wide, narrow, "source"), undefined);
  assert.equal(selectCsharpUnionArmMapping(narrow, wide, "target"), undefined);
  assert.equal(selectCsharpUnionArmMapping(narrow, wrong, "source"), undefined);
  assert.equal(selectCsharpUnionArmMapping(narrow, wrong, "target"), undefined);
  const duplicate = csharpRuntimeUnionTargetType([string, string]);
  assert.equal(selectCsharpUnionArmMapping(narrow, duplicate, "source"), undefined);
  assert.equal(selectCsharpUnionArmMapping(duplicate, wide, "source"), undefined);
  assert.ok(Object.isFrozen(widening) && widening.every(Object.isFrozen));
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() {} }, target: {} };
  assert.deepEqual(selectCsharpConversion(policy, narrow, wide, "implicit"), { kind: "union-map", coverage: "source", arms: widening });
  assert.equal(selectCsharpConversion(policy, wide, narrow, "implicit").kind, "rejected");
  const selection = selectCsharpFlowReadConversion(policy, csharpNullableTargetType(wide), csharpNullableTargetType(narrow));
  assert.deepEqual(selection, { kind: "union-map", coverage: "target", arms: narrowing });
  const context = { program: { source: { ast: { pos: () => 0, end: () => 5 } } }, scope: {}, names: { temporaryName: name => name } };
  const expression = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "Next" }, arguments: [] };
  const diagnostics = [];
  const planned = planCsharpUnionMapping({}, expression, csharpNullableTargetType(wide), csharpNullableTargetType(narrow), selection, context, diagnostics);
  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "SwitchExpression");
  assert.equal(planned.expression, expression);
  assert.equal(planned.arms[2].pattern.kind, "ConstantPattern");
  assert.equal(planned.arms[2].pattern.expression.value, null);
  assert.equal(planned.arms[3].expression.kind, "ThrowExpression");
  for (const arms of [narrowing.slice(1), [...narrowing, narrowing[0]], narrowing.toReversed(),
    narrowing.map((arm, index) => index === 0 ? { ...arm, target: 19 } : arm),
    narrowing.map((arm, index) => index === 0 ? { ...arm, carrier: boolean } : arm)]) {
    diagnostics.length = 0;
    assert.equal(planCsharpUnionMapping({}, expression, wide, narrow, { ...selection, arms }, context, diagnostics), undefined);
    assert.equal(diagnostics.length, 1);
  }
  assert.equal(planCsharpUnionMapping({}, expression, wide, csharpNullableTargetType(narrow), selection, context, diagnostics), undefined);
});
