import assert from "node:assert/strict";
import test from "node:test";
import { csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { checkedSourceScalarLiterals } from "../../helpers/source-literal-values.mjs";
import { selectCsharpNumericBinaryPromotion } from "../../../dist/policy/operations/numeric/promotion.js";

const none = Object.freeze({ kind: "none" });
const primitive = csharpSourcePrimitiveTargetType;
const fixed = name => Object.freeze({ type: primitive(name), scalar: none });
const scalar = (text, type = primitive("float64")) => Object.freeze({ type,
  scalar: Object.freeze({ kind: "present", value: checkedSourceScalarLiterals([text])[0] }) });
const bigint = text => scalar(`${text}n`, csharpBigIntegerTargetType());
const promoted = name => {
  const type = primitive(name);
  return { leftType: type, rightType: type, resultType: type };
};

test("C# numeric promotion follows exact predefined target arithmetic", () => {
  for (const [left, right, result] of [
    ["int8", "int8", "int32"], ["uint32", "int32", "int64"], ["float32", "int64", "float32"],
    ["native-int", "native-int", "native-int"], ["int128", "int128", "int128"],
  ]) assert.deepEqual(selectCsharpNumericBinaryPromotion(fixed(left), fixed(right)), promoted(result));
  for (const [left, right] of [
    ["uint64", "int64"], ["decimal", "float64"], ["native-int", "int32"], ["int128", "int64"],
  ]) assert.equal(selectCsharpNumericBinaryPromotion(fixed(left), fixed(right)), undefined);
});

test("C# numeric promotion uses exact representable literal evidence", () => {
  assert.deepEqual(selectCsharpNumericBinaryPromotion(fixed("int32"), scalar("2")), promoted("int32"));
  assert.deepEqual(selectCsharpNumericBinaryPromotion(fixed("float32"), scalar("1.5")), promoted("float32"));
});

test("C# numeric promotion honors an exact enclosing result type only for representable operands", () => {
  assert.deepEqual(selectCsharpNumericBinaryPromotion(scalar("7"), scalar("2"), primitive("int32")), promoted("int32"));
  assert.deepEqual(selectCsharpNumericBinaryPromotion(scalar("1.5"), scalar("2.5"), primitive("float32")), promoted("float32"));
  assert.deepEqual(selectCsharpNumericBinaryPromotion(scalar("7"), scalar("2.5"), primitive("int32")), promoted("float64"));
  assert.deepEqual(selectCsharpNumericBinaryPromotion(fixed("float64"), scalar("2"), primitive("int32")), promoted("float64"));
});

test("C# native integer operands retain exact bigint literal bounds", () => {
  for (const [name, text] of [
    ["uint64", "9007199254740993"], ["uint64", "18446744073709551615"], ["int64", "9223372036854775807"],
  ]) assert.deepEqual(selectCsharpNumericBinaryPromotion(fixed(name), bigint(text)), promoted(name));
  for (const [name, text] of [["uint64", "18446744073709551616"], ["int64", "9223372036854775808"]]) {
    assert.equal(selectCsharpNumericBinaryPromotion(fixed(name), bigint(text)), undefined);
  }
});

test("C# exact arithmetic contexts select native carriers before broad bigint classification", () => {
  for (const name of ["int64", "uint64", "native-int", "native-uint"]) {
    assert.deepEqual(selectCsharpNumericBinaryPromotion(bigint("64"), bigint("1024"), primitive(name)), promoted(name));
  }
  assert.deepEqual(selectCsharpNumericBinaryPromotion(scalar("7"), scalar("2"), primitive("uint8")), promoted("int32"));
  assert.equal(selectCsharpNumericBinaryPromotion(bigint("18446744073709551616"), bigint("1"), primitive("uint64")), undefined);
  assert.equal(selectCsharpNumericBinaryPromotion({ type: csharpBigIntegerTargetType(), scalar: none },
    bigint("1"), primitive("uint64")), undefined);
});
