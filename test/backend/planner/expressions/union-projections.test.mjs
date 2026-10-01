import assert from "node:assert/strict";
import test from "node:test";
import { nativeUnionProjectionMutations } from "../../../../../tsonic/test/fixtures/native-union-projection-mutations.mjs";
import { planCsharpNativeUnionProjection } from "../../../../dist/backend/planner/expressions/union-projections.js";
import { csharpRuntimeUnionTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

test("native union projection proves every carrier and selection without delegates or repeated receiver evaluation", () => {
  const carriers = [csharpSourcePrimitiveTargetType("int64"), csharpStringTargetType(), csharpSourcePrimitiveTargetType("bool")];
  const fact = { unionCarrier: csharpRuntimeUnionTargetType(carriers), selectedVariantIndexes: [0, 1],
    variants: carriers.map((carrier, index) => ({ carrier, ...(index < 2 ? { operation: { index } } : {}) })) };
  const receiver = { kind: "IdentifierName", name: "value" };
  const input = { program: { source: { ast: { pos: () => 1, end: () => 2 } } },
    names: { temporaryName: name => name } };
  const plan = (selected, diagnostics) => planCsharpNativeUnionProjection({}, receiver, selected, input, diagnostics,
    variant => variant.operation, payload => payload);
  const diagnostics = [];
  const result = plan(fact, diagnostics);
  assert.deepEqual(diagnostics, []);
  assert.equal(result.kind, "SwitchExpression");
  assert.equal(result.expression, receiver);
  assert.equal(result.arms.length, 3);
  assert.equal(result.arms[2].expression.kind, "ThrowExpression");
  assert.doesNotMatch(JSON.stringify(result), /LambdaExpression|Delegate|Match/u);
  for (const mutation of nativeUnionProjectionMutations(fact, csharpSourcePrimitiveTargetType("uint64"))) {
    const rejected = [];
    assert.equal(plan({ ...fact, ...mutation }, rejected), undefined, JSON.stringify(mutation));
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].code, "CSHARP_UNION_PROJECTION_CONTRACT_INVALID");
  }
});
