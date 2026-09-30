import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpClosedTypeTestPlan } from "../../../../dist/policy/operations/operators/type-tests.js";
import { csharpClosedTypeTestMatches } from "../../../../dist/analysis/operations/type-tests.js";
import { planCsharpClosedTypeTest } from "../../../../dist/backend/planner/expressions/type-tests.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpStringTargetType,
  csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";

test("closed nominal tests reject missing, forged and reordered test evidence", () => {
  const object = csharpTargetNamedType("Fixture.Item", [], { kind: "named", name: "Item" }, { sourceDeclarationKind: "class" });
  const sourceCarrier = csharpNullableTargetType(csharpRuntimeUnionTargetType([csharpStringTargetType(), object]));
  const fact = { sourceCarrier, targetCarrier: object, test: selectCsharpClosedTypeTestPlan(sourceCarrier, object) };
  assert.equal(fact.test.kind, "optional");
  assert.equal(fact.test.test.kind, "union");
  const arms = fact.test.test.arms;
  assert.ok(Object.isFrozen(fact.test) && Object.isFrozen(arms) && arms.every(Object.isFrozen));
  const expression = { kind: "IdentifierName", name: "operand" };
  const input = { scope: {} };
  const state = () => ({ nextTempIndex: 0, usedNames: new Set() });
  assert.equal(csharpClosedTypeTestMatches(fact), true);
  assert.equal(planCsharpClosedTypeTest(expression, fact, input, state()).kind, "SwitchExpression");
  const cyclic = { kind: "optional", element: fact.test.element };
  cyclic.test = cyclic;
  for (const selected of [undefined, null, cyclic, { kind: "native" }, { kind: "constant", value: true },
    ...[[], new Array(arms.length), [null, arms[1]], [...arms].reverse(),
      arms.map(arm => ({ ...arm, test: { kind: "constant", value: true } }))].map(arms =>
      ({ ...fact.test, test: { ...fact.test.test, arms } }))]) {
    const altered = { ...fact, test: selected };
    assert.equal(csharpClosedTypeTestMatches(altered), false);
    assert.equal(planCsharpClosedTypeTest(expression, altered, input, state()), undefined);
  }
});
