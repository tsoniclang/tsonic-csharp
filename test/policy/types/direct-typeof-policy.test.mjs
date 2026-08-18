import assert from "node:assert/strict";
import test from "node:test";

import {
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  getCsharpTypeofRuntimeKind,
  selectCsharpTypeofComparison,
} from "../../../dist/policy/index.js";

test("C# typeof policy distinguishes an exact runtime kind from a nullable carrier", () => {
  const stringType = csharpStringTargetType();
  const nullableString = csharpNullableTargetType(stringType);

  assert.equal(getCsharpTypeofRuntimeKind(stringType), "string");
  assert.equal(getCsharpTypeofRuntimeKind(nullableString), undefined);
  assert.deepEqual(
    selectCsharpTypeofComparison(nullableString, "string", false),
    {
      kind: "target-type-test",
      targetType: stringType,
      negated: false,
    },
  );
  assert.deepEqual(
    selectCsharpTypeofComparison(nullableString, "string", true),
    {
      kind: "target-type-test",
      targetType: stringType,
      negated: true,
    },
  );
});

test("C# typeof policy handles nullable value aliases without guessing from source names", () => {
  const float64Type = csharpSourcePrimitiveTargetType("float64");
  const nullableFloat64 = csharpNullableTargetType(float64Type);

  assert.equal(getCsharpTypeofRuntimeKind(nullableFloat64), undefined);
  assert.deepEqual(
    selectCsharpTypeofComparison(nullableFloat64, "number", false),
    {
      kind: "target-type-test",
      targetType: float64Type,
      negated: false,
    },
  );
  assert.deepEqual(
    selectCsharpTypeofComparison(nullableFloat64, "string", false),
    { kind: "constant", value: false },
  );
  assert.deepEqual(
    selectCsharpTypeofComparison(nullableFloat64, "string", true),
    { kind: "constant", value: true },
  );
});
