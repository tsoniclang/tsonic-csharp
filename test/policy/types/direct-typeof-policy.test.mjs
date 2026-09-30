import assert from "node:assert/strict";
import test from "node:test";

import {
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  getCsharpTypeofRuntimeKind,
  selectCsharpTypeofComparison,
} from "../../../dist/policy/index.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { getCsharpTypeofResult } from "../../../dist/target-model/types/runtime-kind.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/runtime-carriers.js";

function categorySelection(sourceCarrier, runtimeKind, negated) {
  return { kind: "runtime-category-test", sourceCarrier, category: getCsharpTypeofResult(sourceCarrier), runtimeKind, negated };
}

test("C# typeof recognizes callable contracts without name guesses or extra category hints", () => {
  const callable = csharpDelegateTargetType("System.Func", [], csharpStringTargetType());
  assert.equal(getCsharpTypeofRuntimeKind(callable), "function");
  const { csharpDelegateSignature, ...withoutContract } = callable;
  assert.equal(getCsharpTypeofRuntimeKind(withoutContract), undefined);
  assert.equal(getCsharpTypeofRuntimeKind({ ...callable, id: "renamed:exact-delegate" }), "function");
  assert.equal(getCsharpTypeofRuntimeKind(csharpNullableTargetType(callable)), undefined);
  assert.deepEqual(selectCsharpTypeofComparison(csharpNullableTargetType(callable), "function", false),
    categorySelection(csharpNullableTargetType(callable), "function", false));
});

test("C# typeof policy distinguishes an exact runtime kind from a nullable carrier", () => {
  const stringType = csharpStringTargetType();
  const nullableString = csharpNullableTargetType(stringType);

  assert.equal(getCsharpTypeofRuntimeKind(stringType), "string");
  assert.equal(getCsharpTypeofRuntimeKind(nullableString), undefined);
  assert.deepEqual(
    selectCsharpTypeofComparison(nullableString, "string", false),
    categorySelection(nullableString, "string", false),
  );
  assert.deepEqual(
    selectCsharpTypeofComparison(nullableString, "string", true),
    categorySelection(nullableString, "string", true),
  );
});

test("C# typeof policy handles nullable value aliases without guessing from source names", () => {
  const float64Type = csharpSourcePrimitiveTargetType("float64");
  const nullableFloat64 = csharpNullableTargetType(float64Type);

  assert.equal(getCsharpTypeofRuntimeKind(nullableFloat64), undefined);
  assert.deepEqual(
    selectCsharpTypeofComparison(nullableFloat64, "number", false),
    categorySelection(nullableFloat64, "number", false),
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

test("closed typeof comparisons retain repeated categories, nested absence and mismatches", () => {
  const first = csharpSourcePrimitiveTargetType("int32");
  const second = csharpSourcePrimitiveTargetType("uint32");
  const allNumbers = csharpRuntimeUnionTargetType([first, second]);
  assert.deepEqual(selectCsharpTypeofComparison(allNumbers, "number", false), { kind: "constant", value: true });
  assert.deepEqual(selectCsharpTypeofComparison(allNumbers, "string", false), { kind: "constant", value: false });
  assert.deepEqual(selectCsharpTypeofComparison(allNumbers, "string", true), { kind: "constant", value: true });
  const value = csharpNullableTargetType(csharpRuntimeUnionTargetType([allNumbers, csharpStringTargetType()]));
  for (const kind of ["object", "number", "string"]) {
    assert.deepEqual(selectCsharpTypeofComparison(value, kind, false), categorySelection(value, kind, false));
    assert.deepEqual(selectCsharpTypeofComparison(value, kind, true), categorySelection(value, kind, true));
  }
  assert.equal(selectCsharpTypeofComparison(undefined, "number", false).kind, "rejected");
  assert.equal(selectCsharpTypeofComparison({ kind: "target-named", id: "opaque", name: "Opaque" }, "object", false).kind, "rejected");
});
