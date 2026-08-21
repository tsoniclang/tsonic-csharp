import assert from "node:assert/strict";
import test from "node:test";

import {
  selectCsharpCommonImplicitTarget,
  selectCsharpConversion,
  selectCsharpFlowReadConversion,
} from "../../../dist/policy/conversions/index.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpNullableTargetType,
  csharpTargetNamedType,
  csharpRuntimeUnionTargetType,
} from "../../../dist/policy/types/index.js";
import {
  reconcileInferredReturnTargetContract,
} from "../../../dist/analysis/declarations/index.js";

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

test("tuple conversions apply exact element conversions at equal arity", () => {
  const nullableFloat64 = csharpNullableTargetType(float64);
  assert.deepEqual(
    selectCsharpConversion(
      host,
      { kind: "tuple", elements: [string, float64] },
      { kind: "tuple", elements: [string, nullableFloat64] },
      "implicit",
    ),
    { kind: "implicit", proof: "tuple" },
  );
  assert.deepEqual(
    selectCsharpConversion(
      host,
      { kind: "tuple", elements: [string] },
      { kind: "tuple", elements: [string, nullableFloat64] },
      "implicit",
    ),
    {
      kind: "rejected",
      reason: "C# tuple conversion requires equal source and target arity.",
    },
  );
});

test("native arrays convert only through explicit target input capability", () => {
  const target = csharpTargetNamedType(
    "Fixture.Assembly::Fixture.Sequence`1",
    [int32],
    undefined,
    { implicitArrayInputElementType: int32 },
  );
  assert.deepEqual(
    selectCsharpConversion(
      host,
      { kind: "array", element: int32 },
      target,
      "implicit",
    ),
    { kind: "implicit", proof: "collection-interface" },
  );
  assert.equal(
    selectCsharpConversion(
      host,
      { kind: "array", element: float64 },
      target,
      "implicit",
    ).kind,
    "rejected",
  );
  assert.equal(
    selectCsharpConversion(
      host,
      { kind: "array", element: int32 },
      csharpTargetNamedType(
        "Fixture.Assembly::Fixture.Sequence`1",
        [int32],
      ),
      "implicit",
    ).kind,
    "rejected",
  );
});

test("flow reads project one exact runtime-union arm", () => {
  const union = csharpRuntimeUnionTargetType([int32, string]);
  assert.ok(union);
  assert.deepEqual(
    selectCsharpFlowReadConversion(host, union, string),
    {
      kind: "runtime-union-projection",
      armIndex: 1,
      armType: string,
    },
  );
  assert.equal(
    selectCsharpFlowReadConversion(host, union, float64).kind,
    "rejected",
  );
});
