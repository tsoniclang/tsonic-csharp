import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpExactIntegerConversion } from "../../../dist/policy/conversions/selection/exact-integer.js";
import { csharpNullableValueTargetType } from "../../../dist/target-model/types/nullable.js";
import { csharpObjectShapesEqual } from "../../../dist/target-model/types/object-shape-equality.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/selection/core.js";
import { csharpJsArrayTargetType, csharpReadOnlyListTargetType } from "../../../dist/policy/types/index.js";

const primitive = name => ({ kind: "source-primitive", name });
const integers = ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "native-int", "native-uint", "int128", "uint128"];

test("native JSArray read-only-list conversion retains the exact element carrier", () => {
  const input = { projectTypes: { typeFromTarget: () => undefined }, providers: [] };
  for (const name of integers) {
    const element = primitive(name);
    assert.deepEqual(selectCsharpConversion(input, csharpJsArrayTargetType(element), csharpReadOnlyListTargetType(element), "implicit"),
      { kind: "implicit", proof: "collection-interface" });
  }
});

test("exact native storage keeps every integer width and does not route through floating point", () => {
  for (const input of integers) for (const output of integers) {
    assert.deepEqual(selectCsharpExactIntegerConversion(primitive(input), primitive(output)), { kind: "checked-native-integer" });
  }
  for (const name of ["float32", "float64", "decimal"]) for (const output of integers) {
    const input = primitive(name);
    const target = primitive(output);
    assert.deepEqual(selectCsharpExactIntegerConversion(input, target), { kind: "exact-integer", input, output: target, nullable: false });
    assert.deepEqual(selectCsharpExactIntegerConversion(input, csharpNullableValueTargetType(target)), { kind: "exact-integer", input, output: target, nullable: false });
    assert.deepEqual(selectCsharpExactIntegerConversion(csharpNullableValueTargetType(input), csharpNullableValueTargetType(target)), { kind: "exact-integer", input, output: target, nullable: true });
    assert.equal(selectCsharpExactIntegerConversion(csharpNullableValueTargetType(input), target), undefined);
  }
});

test("exact storage requires numeric evidence and remains part of shape identity", () => {
  for (const type of [primitive("bool"), primitive("char"), { kind: "opaque", id: "unknown" }, { kind: "type-parameter", name: "Value" }]) {
    assert.equal(selectCsharpExactIntegerConversion(type, primitive("int32")), undefined);
    assert.equal(selectCsharpExactIntegerConversion(primitive("float64"), type), undefined);
  }
  assert.equal(selectCsharpExactIntegerConversion(primitive("float64"), primitive("float32")), undefined);
  const field = { sourceKey: { kind: "property", name: "count" }, sourceName: "count", targetName: "count", memberKind: "property", type: primitive("int32") };
  const shape = { targetType: { kind: "target-named", id: "native.Options" }, members: [field] };
  assert.equal(csharpObjectShapesEqual(shape, { ...shape, members: [{ ...field, exactNumericStorage: true }] }), false);
  assert.equal(csharpObjectShapesEqual(shape, shape), true);
});
