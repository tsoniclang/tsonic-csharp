import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpClosedTypeTestPlan } from "../../../../dist/policy/operations/operators/type-tests.js";
import { csharpClosedTypeTestMatches } from "../../../../dist/analysis/operations/type-tests.js";
import { planCsharpClosedTypeTest } from "../../../../dist/backend/planner/expressions/type-tests.js";
import { analyzeCsharpClosedTypeTests } from "../../../../dist/analysis/operations/type-test-emission.js";
import { csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";

// The type-test emission the analysis seals for one array-predicate call carrying the fact, and the planner context reading it.
function sealedTypeTest(fact) {
  const node = {};
  return analyzeCsharpClosedTypeTests([node], { selectedCall: { get: subject => subject === node ? { form: { kind: "type-test", typeTest: fact } } : undefined },
    binaryOperation: { get: () => undefined } }, undefined);
}
const planning = analysis => ({ scope: {}, program: { records: { closedTypeTestEmission: analysis.records.closedTypeTestEmission,
  typeEmission: csharpTypeEmissionRecord() } } });
const missingPlan = error => error instanceof Error && error.phase === "planning" &&
  error.message === "An admitted type predicate requires its native emission plan.";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpStringTargetType,
  csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";
import { csharpJsArrayTargetType, csharpJsDateTargetType, csharpJsRegExpTargetType,
  csharpJsMapTargetType, csharpJsSetTargetType, csharpJsArrayBufferTargetType, csharpJsDataViewTargetType,
  csharpJsTypedArrayTargetType } from "../../../../dist/target-model/types/carriers/js.js";

test("closed array tests distinguish generated structural carriers from open native references", () => {
  const structural = csharpTargetNamedType("tsonic.shape:fixture", [], { kind: "named", name: "Record" }, { allowsRefLikeTypeArguments: [],});
  const native = csharpTargetNamedType("Fixture.Unknown", [], { kind: "named", name: "Unknown" }, { allowsRefLikeTypeArguments: [],});
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
  const open = csharpTargetNamedType("Fixture.Unknown", [], { kind: "named", name: "Unknown" }, { allowsRefLikeTypeArguments: [],});
  const categoryOnly = { ...open, csharpTypeofRuntimeKind: "object" };
  assert.deepEqual(selectCsharpClosedTypeTestPlan(categoryOnly, { kind: "array" }), { kind: "runtime-array" });
});

for (const kind of ["nominal", "array"]) test(`closed ${kind} tests reject missing, forged and reordered test evidence`, () => {
  const object = csharpTargetNamedType("Fixture.Item", [], { kind: "named", name: "Item" }, { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class" });
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
  const state = () => ({ nextTempIndex: 0, usedNames: new Set() });
  assert.equal(csharpClosedTypeTestMatches(fact), true);
  const admitted = sealedTypeTest(fact);
  assert.deepEqual(admitted.issues, []);
  const prelude = [];
  assert.equal(planCsharpClosedTypeTest(expression, fact, planning(admitted), state(), prelude, "omit").kind, "SwitchExpression");
  assert.equal(prelude.length, 0, "the genuine optional/union dispatch keeps its single original receiver");
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
    // The analysis refuses the forged test and seals no plan; the planner never plans an unsealed one.
    const refused = sealedTypeTest(altered);
    assert.equal(refused.issues.length, 1);
    assert.throws(() => planCsharpClosedTypeTest(expression, altered, planning(refused), state(), prelude, "omit"), missingPlan);
  }
  for (const changes of [{ predicate: undefined }, { predicate: null }, { predicate: { kind: "unknown" } },
    { predicate: { ...predicate, unexpected: true } }, { sourceCarrier: null },
    { sourceCarrier: csharpStringTargetType() }]) {
    const altered = { ...fact, ...changes };
    assert.equal(csharpClosedTypeTestMatches(altered), false);
    // A missing predicate cannot come from a call classification; the analysis is exercised with defined predicates.
    if (altered.predicate !== undefined && altered.predicate !== null) assert.equal(sealedTypeTest(altered).issues.length, 1);
    assert.throws(() => planCsharpClosedTypeTest(expression, altered, planning(admitted), state(), prelude, "omit"), missingPlan);
  }
});
