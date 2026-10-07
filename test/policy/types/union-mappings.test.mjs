import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpRuntimeUnionTargetType, csharpNullableTargetType } from "../../../dist/target-model/types/index.js";
import { selectCsharpUnionArmMapping } from "../../../dist/target-model/types/union-relations.js";
import { selectCsharpConversion, selectCsharpFlowReadConversion } from "../../../dist/policy/conversions/index.js";
import { planCsharpUnionMapping } from "../../../dist/backend/planner/expressions/union-mappings.js";
import { csharpRuntimeUnionMappingMatches } from "../../../dist/analysis/conversions/validation.js";

test("union mappings require complete exact coverage and reject forged or numeric-changing arms", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const narrow = csharpRuntimeUnionTargetType([string, integer]);
  const wide = csharpRuntimeUnionTargetType([integer, boolean, string]);
  const wrong = csharpRuntimeUnionTargetType([string, csharpSourcePrimitiveTargetType("float64")]);
  const widening = selectCsharpUnionArmMapping(narrow, wide, "source");
  const narrowing = selectCsharpUnionArmMapping(wide, narrow, "target");
  assert.deepEqual(widening.map(arm => [arm.source[0].index, arm.target[0].index]), [[0, 2], [1, 0]]);
  assert.deepEqual(narrowing.map(arm => [arm.source[0].index, arm.target[0].index]), [[0, 1], [2, 0]]);
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
  const context = { program: { source: { ast: { pos: () => 0, end: () => 5 } }, conversions: {
    matchesUnionMapping: (source, target, selected) => csharpRuntimeUnionMappingMatches(policy, source, target, selected),
  } }, scope: {}, names: { temporaryName: name => name } };
  const expression = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "Next" }, arguments: [] };
  const diagnostics = [];
  const planned = planCsharpUnionMapping({}, expression, csharpNullableTargetType(wide), csharpNullableTargetType(narrow), selection, context, diagnostics);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.kind, "SwitchExpression");
  assert.equal(planned.expression, expression);
  assert.equal(planned.arms[2].pattern.kind, "ConstantPattern");
  assert.equal(planned.arms[2].pattern.expression.value, null);
  assert.equal(planned.arms[3].expression.kind, "ThrowExpression");
  for (const arms of [narrowing.slice(1), [...narrowing, narrowing[0]], narrowing.toReversed(),
    narrowing.map((arm, index) => index === 0 ? { ...arm, target: [{ union: narrow, index: 19 }] } : arm),
    narrowing.map((arm, index) => index === 0 ? { ...arm, carrier: boolean } : arm)]) {
    diagnostics.length = 0;
    assert.equal(planCsharpUnionMapping({}, expression, wide, narrow, { ...selection, arms }, context, diagnostics), undefined);
    assert.equal(diagnostics.length, 1);
  }
  assert.equal(planCsharpUnionMapping({}, expression, wide, csharpNullableTargetType(narrow), selection, context, diagnostics), undefined);
});

test("nested union paths preserve each native grouping and reject stale intermediate carriers", () => {
  const integer = csharpSourcePrimitiveTargetType("uint64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const inner = csharpRuntimeUnionTargetType([integer, string]);
  const nested = csharpRuntimeUnionTargetType([boolean, inner]);
  const flat = csharpRuntimeUnionTargetType([string, boolean, integer]);
  const arms = selectCsharpUnionArmMapping(flat, nested, "source");
  assert.deepEqual(arms.map(arm => arm.target.map(step => step.index)), [[1, 1], [0], [1, 0]]);
  assert.deepEqual(arms.map(arm => arm.carrier), [string, boolean, integer]);
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined } };
  const context = { program: { source: { ast: { pos: () => 0, end: () => 5 } }, conversions: {
    matchesUnionMapping: (source, target, selected) => csharpRuntimeUnionMappingMatches(policy, source, target, selected),
  } }, scope: {}, names: { temporaryName: name => name } };
  const expression = { kind: "IdentifierName", name: "original" };
  const selection = { kind: "union-map", coverage: "source", arms };
  const diagnostics = [];
  const planned = planCsharpUnionMapping({}, expression, flat, nested, selection, context, diagnostics);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.arms[0].expression.callee.name, "From2");
  assert.equal(planned.arms[0].expression.arguments[0].expression.callee.name, "From2");
  for (const target of [arms[0].target.slice(1), arms[0].target.toReversed(),
    arms[0].target.map(step => ({ ...step, union: flat })), [arms[0].target[0], arms[0].target[0]]]) {
    diagnostics.length = 0;
    assert.equal(planCsharpUnionMapping({}, expression, flat, nested,
      { ...selection, arms: [{ ...arms[0], target }, ...arms.slice(1)] }, context, diagnostics), undefined);
    assert.equal(diagnostics.length, 1);
  }
});
