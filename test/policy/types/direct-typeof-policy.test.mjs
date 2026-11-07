import assert from "node:assert/strict";
import test from "node:test";

import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { getCsharpTypeofRuntimeKind } from "../../../dist/target-model/types/runtime-kind.js";
import { selectCsharpTypeofComparison } from "../../../dist/policy/operations/syntax/typeof.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { selectCsharpClosedTypeTestPlan } from "../../../dist/policy/operations/operators/type-tests.js";

// Basis (nextgen C-2542, K-2658, N3'): typeof comparisons read the Host typeof categories (facts.values.typeofCategory),
// projected onto the physical carrier by selectCsharpTypeofResult. These fixtures state the published categories.
function optional(sourceCarrier, value, absent = "object") {
  return Object.freeze({ kind: "optional", sourceCarrier, element: getCsharpNullableElementTargetType(sourceCarrier), value, absent });
}
function categorySelection(sourceCarrier, category, runtimeKind, negated) {
  return { kind: "runtime-category-test", sourceCarrier, category, runtimeKind, negated };
}

test("native categories retain exact declaration authority after definition sealing", () => {
  let lookups = 0;
  let kind = "class";
  const definitions = createCsharpTypeDefinitionRegistry(id => {
    lookups++;
    return id === "native.selected" ? { id, target: "csharp", sourceName: "UnrelatedName", targetName: "UnrelatedName", kind }
      : id === "native.wrong" ? { id: "native.other", target: "csharp", sourceName: "Selected", targetName: "Selected", kind: "class" }
      : undefined;
  });
  const selected = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "native.selected" };
  assert.equal(getCsharpTypeofRuntimeKind(selected, definitions), "object");
  assert.deepEqual(selectCsharpClosedTypeTestPlan(selected, { kind: "array" }, new Set(), definitions), { kind: "runtime-array" });
  assert.equal(getCsharpTypeofRuntimeKind({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "native.wrong" }, definitions), undefined);
  assert.equal(getCsharpTypeofRuntimeKind({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "native.missing" }, definitions), undefined);
  const sealed = definitions.seal();
  const before = lookups;
  kind = "interface";
  assert.equal(getCsharpTypeofRuntimeKind({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "native.late" }, sealed), undefined);
  assert.equal(lookups, before);
  const other = createCsharpTypeDefinitionRegistry(id => ({ id, target: "csharp", sourceName: "Class", targetName: "Class", kind: "interface" }));
  assert.equal(getCsharpTypeofRuntimeKind(selected, other), undefined);
  assert.equal(getCsharpTypeofRuntimeKind({ ...csharpStringTargetType(), id: "native.selected" }, definitions), "string");
});

test("C# typeof recognizes callable contracts without name guesses or extra category hints", () => {
  const callable = csharpDelegateTargetType("System.Func", [], csharpStringTargetType());
  assert.equal(getCsharpTypeofRuntimeKind(callable), "function");
  const { csharpDelegateSignature, ...withoutContract } = callable;
  assert.equal(getCsharpTypeofRuntimeKind(withoutContract), undefined);
  assert.equal(getCsharpTypeofRuntimeKind({ ...callable, id: "renamed:exact-delegate" }), "function");
  assert.equal(getCsharpTypeofRuntimeKind(csharpNullableTargetType(callable)), undefined);
  const carrier = csharpNullableTargetType(callable);
  const category = optional(carrier, "function");
  assert.deepEqual(selectCsharpTypeofComparison(carrier, category, "function", false),
    categorySelection(carrier, category, "function", false));
});

test("C# typeof policy distinguishes an exact Host category from a nullable carrier", () => {
  const stringType = csharpStringTargetType();
  const nullableString = csharpNullableTargetType(stringType);
  assert.equal(getCsharpTypeofRuntimeKind(stringType), "string");
  assert.equal(getCsharpTypeofRuntimeKind(nullableString), undefined);
  assert.deepEqual(selectCsharpTypeofComparison(stringType, "string", "string", false), { kind: "constant", value: true });
  const category = optional(nullableString, "string");
  assert.deepEqual(selectCsharpTypeofComparison(nullableString, category, "string", false),
    categorySelection(nullableString, category, "string", false));
  assert.deepEqual(selectCsharpTypeofComparison(nullableString, category, "string", true),
    categorySelection(nullableString, category, "string", true));
});

test("C# typeof policy handles nullable value aliases from the Host categories, absent value included", () => {
  const nullableFloat64 = csharpNullableTargetType(csharpSourcePrimitiveTargetType("float64"));
  assert.equal(getCsharpTypeofRuntimeKind(nullableFloat64), undefined);
  const nullOnly = optional(nullableFloat64, "number", "object");
  assert.deepEqual(selectCsharpTypeofComparison(nullableFloat64, nullOnly, "number", false),
    categorySelection(nullableFloat64, nullOnly, "number", false));
  assert.deepEqual(selectCsharpTypeofComparison(nullableFloat64, nullOnly, "string", false), { kind: "constant", value: false });
  assert.deepEqual(selectCsharpTypeofComparison(nullableFloat64, nullOnly, "string", true), { kind: "constant", value: true });
  // undefined-only admission: the absent value is "undefined" (N3'); "object" never holds.
  const undefinedOnly = optional(nullableFloat64, "number", "undefined");
  assert.deepEqual(selectCsharpTypeofComparison(nullableFloat64, undefinedOnly, "object", false), { kind: "constant", value: false });
  assert.deepEqual(selectCsharpTypeofComparison(nullableFloat64, undefinedOnly, "undefined", false),
    categorySelection(nullableFloat64, undefinedOnly, "undefined", false));
});

test("closed typeof comparisons follow the Host arm categories, never the carrier (K-2658)", () => {
  const first = csharpSourcePrimitiveTargetType("int32");
  const second = csharpSourcePrimitiveTargetType("uint32");
  const allNumbers = csharpRuntimeUnionTargetType([first, second]);
  const numbers = Object.freeze({ kind: "runtime-union", sourceCarrier: allNumbers,
    arms: [{ carrier: first, result: "number" }, { carrier: second, result: "number" }] });
  assert.deepEqual(selectCsharpTypeofComparison(allNumbers, numbers, "number", false), { kind: "constant", value: true });
  assert.deepEqual(selectCsharpTypeofComparison(allNumbers, numbers, "string", false), { kind: "constant", value: false });
  assert.deepEqual(selectCsharpTypeofComparison(allNumbers, numbers, "string", true), { kind: "constant", value: true });
  // A Q1 int64 arm of number origin is "number" by the Host record; its physical carrier would have said "bigint".
  const int64 = csharpSourcePrimitiveTargetType("int64");
  const mixed = csharpRuntimeUnionTargetType([int64, csharpStringTargetType()]);
  const mixedCategory = Object.freeze({ kind: "runtime-union", sourceCarrier: mixed,
    arms: [{ carrier: int64, result: "number" }, { carrier: csharpStringTargetType(), result: "string" }] });
  assert.deepEqual(selectCsharpTypeofComparison(mixed, mixedCategory, "bigint", false), { kind: "constant", value: false });
  assert.deepEqual(selectCsharpTypeofComparison(mixed, mixedCategory, "number", false),
    categorySelection(mixed, mixedCategory, "number", false));
});
