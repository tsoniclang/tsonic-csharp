import assert from "node:assert/strict";
import test from "node:test";
import { readCsharpNativeExpressionCarrier } from "../../../../dist/backend/planner/expressions/native-uses.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";

test("a planned storage read uses its exact sealed storage carrier instead of its narrowed value", () => {
  const expression = {};
  const other = {};
  const value = csharpSourcePrimitiveTargetType("float64");
  const storage = csharpNullableTargetType(value);
  const input = { storageExpression: expression, program: { records: {
    nativeExpression: { get: node => node === expression ? { use: { kind: "value", carrier: value } } : undefined },
    valueRead: { get: node => node === expression ? { flowReadStorage: storage } : undefined },
  } } };
  assert.equal(readCsharpNativeExpressionCarrier(input, expression) === storage, true,
    "raw storage syntax and ordered-evaluation temporary have the same nullable native carrier");
  assert.equal(readCsharpNativeExpressionCarrier({ ...input, storageExpression: other }, expression) === value, true,
    "another occurrence's storage context never changes this logical value read");
});

test("an admitted storage read cannot manufacture a missing physical storage carrier", () => {
  const expression = {};
  const input = { storageExpression: expression, program: { records: {
    nativeExpression: { get: () => ({ use: { kind: "value", carrier: csharpSourcePrimitiveTargetType("float64") } }) },
    valueRead: { get: () => undefined },
  } } };
  assert.throws(() => readCsharpNativeExpressionCarrier(input, expression),
    /An admitted storage expression requires its exact sealed storage carrier/u);
});

test("erased native uses never acquire storage completion or query unrelated storage", () => {
  const expression = {};
  const input = { storageExpression: expression, program: { records: {
    nativeExpression: { get: () => ({ use: { kind: "erased" } }) },
    valueRead: { get: () => assert.fail("an erased use has no native storage") },
  } } };
  assert.equal(readCsharpNativeExpressionCarrier(input, expression) === undefined, true);
});
