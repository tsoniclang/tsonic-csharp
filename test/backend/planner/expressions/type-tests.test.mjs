import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpClosedTypeTestPlan } from "../../../../dist/policy/operations/operators/type-tests.js";
import { csharpClosedTypeTestMatches } from "../../../../dist/analysis/operations/type-tests.js";
import { planCsharpClosedTypeTest } from "../../../../dist/backend/planner/expressions/type-tests.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpStringTargetType,
  csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";
import { csharpJsArrayTargetType, csharpJsDateTargetType, csharpJsRegExpTargetType,
  csharpJsMapTargetType, csharpJsSetTargetType, csharpJsArrayBufferTargetType, csharpJsDataViewTargetType,
  csharpJsTypedArrayTargetType } from "../../../../dist/policy/types/resolution/surface-types.js";

test("closed array tests distinguish generated structural carriers from open native references", () => {
  const structural = csharpTargetNamedType("tsonic.shape:fixture", [], { kind: "named", name: "Record" });
  const native = csharpTargetNamedType("Fixture.Unknown", [], { kind: "named", name: "Unknown" });
  assert.deepEqual(selectCsharpClosedTypeTestPlan(structural, { kind: "array" }), { kind: "constant", value: false });
  assert.deepEqual(selectCsharpClosedTypeTestPlan(native, { kind: "array" }), { kind: "runtime-array" });
  assert.equal(csharpClosedTypeTestMatches({ sourceCarrier: structural, predicate: { kind: "array" },
    test: { kind: "constant", value: true } }), false);
});

test("closed profile nonarrays are excluded without guessing about open native references", () => {
  const element = csharpStringTargetType();
  for (const carrier of [csharpJsDateTargetType(), csharpJsRegExpTargetType(),
    csharpJsMapTargetType(element, element), csharpJsSetTargetType(element),
    csharpJsArrayBufferTargetType(), csharpJsDataViewTargetType(), csharpJsTypedArrayTargetType("Uint8Array")]) {
    assert.deepEqual(selectCsharpClosedTypeTestPlan(carrier, { kind: "array" }), { kind: "constant", value: false });
    assert.equal(csharpClosedTypeTestMatches({ sourceCarrier: carrier, predicate: { kind: "array" },
      test: { kind: "constant", value: true } }), false);
  }
  assert.deepEqual(selectCsharpClosedTypeTestPlan(csharpJsArrayTargetType(element), { kind: "array" }),
    { kind: "constant", value: true });
  const open = csharpTargetNamedType("Fixture.Unknown", [], { kind: "named", name: "Unknown" });
  const categoryOnly = { ...open, csharpTypeofRuntimeKind: "object" };
  assert.deepEqual(selectCsharpClosedTypeTestPlan(categoryOnly, { kind: "array" }), { kind: "runtime-array" });
});

for (const kind of ["nominal", "array"]) test(`closed ${kind} tests reject missing, forged and reordered test evidence`, () => {
  const object = csharpTargetNamedType("Fixture.Item", [], { kind: "named", name: "Item" }, { sourceDeclarationKind: "class" });
  const sourceCarrier = csharpNullableTargetType(csharpRuntimeUnionTargetType([
    csharpStringTargetType(), object, { kind: "array", element: csharpStringTargetType() },
  ]));
  const predicate = kind === "array" ? { kind } : { kind, targetCarrier: object };
  const fact = { sourceCarrier, predicate, test: selectCsharpClosedTypeTestPlan(sourceCarrier, predicate) };
  assert.equal(fact.test.kind, "optional");
  assert.equal(fact.test.test.kind, "union");
  const arms = fact.test.test.arms;
  assert.ok(Object.isFrozen(fact.test) && Object.isFrozen(arms) && arms.every(Object.isFrozen));
  const expression = { kind: "IdentifierName", name: "operand" };
  const input = { scope: {}, program: {} };
  const state = () => ({ nextTempIndex: 0, usedNames: new Set() });
  assert.equal(csharpClosedTypeTestMatches(fact), true);
  assert.equal(planCsharpClosedTypeTest(expression, fact, input, state()).kind, "SwitchExpression");
  const cyclic = { kind: "optional", element: fact.test.element };
  cyclic.test = cyclic;
  for (const selected of [undefined, null, cyclic, { kind: "native" }, { kind: "constant", value: true },
    { ...fact.test, unexpected: true }, { ...fact.test, element: null },
    ...[[], new Array(arms.length), [null, ...arms.slice(1)], [...arms].reverse(),
      [{ ...arms[0], carrier: null }, ...arms.slice(1)],
      arms.map(arm => ({ ...arm, test: { kind: "constant", value: true } }))].map(arms =>
      ({ ...fact.test, test: { ...fact.test.test, arms } }))]) {
    const altered = { ...fact, test: selected };
    assert.equal(csharpClosedTypeTestMatches(altered), false);
    assert.equal(planCsharpClosedTypeTest(expression, altered, input, state()), undefined);
  }
  for (const changes of [{ predicate: undefined }, { predicate: null }, { predicate: { kind: "unknown" } },
    { predicate: { ...predicate, unexpected: true } }, { sourceCarrier: null },
    { sourceCarrier: csharpStringTargetType() }]) {
    const altered = { ...fact, ...changes };
    assert.equal(csharpClosedTypeTestMatches(altered), false);
    assert.equal(planCsharpClosedTypeTest(expression, altered, input, state()), undefined);
  }
});
