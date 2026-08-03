import assert from "node:assert/strict";
import test from "node:test";

import {
  selectCsharpCommonImplicitTarget,
} from "../dist/policy/conversions/index.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpNullableTargetType,
} from "../dist/policy/types/index.js";
import {
  reconcileInferredReturnTargetContract,
} from "../dist/backend/planner/declaration-return-types.js";

const host = {
  projectTypes: { directSupertypes() { return []; } },
  providers: { findTargetBindingByTargetId() {} },
  target: {},
};
const int32 = csharpSourcePrimitiveTargetType("int32");
const float64 = csharpSourcePrimitiveTargetType("float64");
const string = csharpSourcePrimitiveTargetType("string");

test("common implicit target keeps an exact narrower observed return", () => {
  assert.deepEqual(
    selectCsharpCommonImplicitTarget(host, [int32], [int32, float64]),
    { kind: "resolved", target: int32 },
  );
});

test("common implicit target widens only when every observed return converts", () => {
  assert.deepEqual(
    selectCsharpCommonImplicitTarget(
      host,
      [int32, float64],
      [int32, float64],
    ),
    { kind: "resolved", target: float64 },
  );
});

test("common implicit target rejects unrelated return representations", () => {
  assert.deepEqual(
    selectCsharpCommonImplicitTarget(
      host,
      [int32, string],
      [int32, string, float64],
    ),
    {
      kind: "rejected",
      reason:
        "No exact candidate accepts every inferred C# return representation through implicit target conversions.",
    },
  );
});

test("inferred return contracts refine erased numeric baselines", () => {
  assert.deepEqual(
    reconcileInferredReturnTargetContract(host, float64, [int32], false),
    { kind: "resolved", type: int32 },
  );
});

test("inferred return contracts retain unobserved nullish alternatives", () => {
  const nullableFloat64 = csharpNullableTargetType(float64);
  assert.deepEqual(
    reconcileInferredReturnTargetContract(
      host,
      nullableFloat64,
      [int32],
      false,
    ),
    { kind: "resolved", type: nullableFloat64 },
  );
});
