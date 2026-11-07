import { knownNativePlatform32, knownNativePlatform64, missingNativePlatform } from "../../helpers/native-integer-platform.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { checkedSourceLiteralValues } from "../../helpers/source-literal-values.mjs";
import { csharpLiteralIsRepresentableAs } from "../../../dist/policy/conversions/literals.js";
import { csharpNumericLiteralFitsSourcePrimitive } from "../../../dist/policy/conversions/literal-range.js";
import * as numericRules from "../../../dist/target-model/syntax/numeric-literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const numeric = (number, integer) => Object.freeze({ form: "numeric", ...(number === undefined ? {} : { number }),
  ...(integer === undefined ? {} : { integer }) });
const bigint = integer => Object.freeze({ form: "bigint", integer });

test("native literal rules do not retain the replaced AST numeric readers", () => {
  assert.equal(Object.hasOwn(numericRules, "csharpNumericLiteralValue"), false);
  assert.equal(Object.hasOwn(numericRules, "csharpBigIntLiteralValue"), false);
});

test("native integer literal rules decide from exact bigint data at every bound", () => {
  for (const [name, minimum, maximum] of [
    ["int8", -128n, 127n], ["uint8", 0n, 255n], ["int16", -32768n, 32767n], ["uint16", 0n, 65535n],
    ["int32", -2147483648n, 2147483647n], ["uint32", 0n, 4294967295n],
    ["int64", -(1n << 63n), (1n << 63n) - 1n], ["uint64", 0n, (1n << 64n) - 1n],
    ["int128", -(1n << 127n), (1n << 127n) - 1n], ["uint128", 0n, (1n << 128n) - 1n],
    ["native-int", -(1n << 63n), (1n << 63n) - 1n], ["native-uint", 0n, (1n << 64n) - 1n],
  ]) {
    assert.equal(csharpLiteralIsRepresentableAs(bigint(minimum), primitive(name), knownNativePlatform64), true, `${name} minimum`);
    assert.equal(csharpLiteralIsRepresentableAs(bigint(maximum), primitive(name), knownNativePlatform64), true, `${name} maximum`);
    assert.equal(csharpLiteralIsRepresentableAs(bigint(minimum - 1n), primitive(name), knownNativePlatform64), false, `${name} below minimum`);
    assert.equal(csharpLiteralIsRepresentableAs(bigint(maximum + 1n), primitive(name), knownNativePlatform64), false, `${name} above maximum`);
  }
  const beyondDouble = numeric(Number("9007199254740993"), 9007199254740993n);
  assert.equal(csharpLiteralIsRepresentableAs(beyondDouble, primitive("int64"), knownNativePlatform64), true, "exact integer beyond 2^53 fits int64");
  assert.equal(csharpLiteralIsRepresentableAs(beyondDouble, primitive("int32"), knownNativePlatform64), false, "exact integer beyond 2^53 is not int32");
  assert.equal(csharpNumericLiteralFitsSourcePrimitive(beyondDouble, "uint64", knownNativePlatform64) &&
    !csharpNumericLiteralFitsSourcePrimitive(numeric(1.5), "int32", knownNativePlatform64), true, "fit predicate reads exact integer data only");
});

test("floating, signed-zero, char, boolean, string and array literal rules keep their exact results", () => {
  const [floating, negativeZero] = checkedSourceLiteralValues(["1.5", "-0"]);
  for (const name of ["float16", "float32", "float64", "decimal"]) {
    assert.equal(csharpLiteralIsRepresentableAs(floating, primitive(name), knownNativePlatform64), true, `${name} finite`);
    assert.equal(csharpLiteralIsRepresentableAs(negativeZero, primitive(name), knownNativePlatform64), true, `${name} signed zero`);
    assert.equal(csharpLiteralIsRepresentableAs(Object.freeze({ form: "prefix-unary" }), primitive(name), knownNativePlatform64), false, `${name} non-literal`);
  }
  assert.equal(Object.is(negativeZero.number, -0), true, "signed zero is kept as -0");
  assert.equal(csharpLiteralIsRepresentableAs(negativeZero, primitive("int32"), knownNativePlatform64), true, "-0 fits an integer as 0");
  assert.equal(csharpLiteralIsRepresentableAs(numeric(1.5), primitive("int32"), knownNativePlatform64), false, "fraction is not an integer");
  const char = text => Object.freeze({ form: "string", text });
  assert.equal(csharpLiteralIsRepresentableAs(char("a"), primitive("char"), knownNativePlatform64), true, "one code unit is a char");
  for (const text of ["", "ab", "\u{1F600}"]) {
    assert.equal(csharpLiteralIsRepresentableAs(char(text), primitive("char"), knownNativePlatform64), false, `${JSON.stringify(text)} is not a char`);
  }
  assert.equal(csharpLiteralIsRepresentableAs(Object.freeze({ form: "true" }), primitive("bool"), knownNativePlatform64) &&
    !csharpLiteralIsRepresentableAs(numeric(1, 1n), primitive("bool"), knownNativePlatform64), true, "only boolean literals are bool");
  assert.equal(csharpLiteralIsRepresentableAs(Object.freeze({ form: "template", text: "x" }), csharpStringTargetType(), knownNativePlatform64) &&
    !csharpLiteralIsRepresentableAs(numeric(1, 1n), csharpStringTargetType(), knownNativePlatform64), true, "only string data is string");
  const array = elements => Object.freeze({ form: "array", elements: Object.freeze(elements) });
  const bytes = { kind: "array", element: primitive("uint8") };
  assert.equal(csharpLiteralIsRepresentableAs(array([numeric(1, 1n), numeric(255, 255n)]), bytes, knownNativePlatform64), true, "every element fits");
  assert.equal(csharpLiteralIsRepresentableAs(array([numeric(1, 1n), numeric(256, 256n)]), bytes, knownNativePlatform64), false, "one element out of range");
  assert.equal(csharpLiteralIsRepresentableAs(array([numeric(1, 1n), undefined]), bytes, knownNativePlatform64), false, "a non-literal element");
  assert.equal(csharpLiteralIsRepresentableAs(array([]), bytes, knownNativePlatform64), true, "a proven empty array fits");
  assert.equal(csharpLiteralIsRepresentableAs(array([undefined]), bytes, knownNativePlatform64), false, "a present one-element list with a hole refuses");
  assert.equal(csharpLiteralIsRepresentableAs(array([undefined, numeric(1, 1n)]), bytes, knownNativePlatform64), false, "a sparse list refuses");
  assert.equal(csharpLiteralIsRepresentableAs(numeric(7, 7n), csharpNullableTargetType(primitive("int32")), knownNativePlatform64), true,
    "nullable target reads its element");
  assert.equal(csharpLiteralIsRepresentableAs(Object.freeze({ form: "binary", integerConstant: 300n }), primitive("int16"), knownNativePlatform64) &&
    !csharpLiteralIsRepresentableAs(Object.freeze({ form: "binary", integerConstant: 300n }), primitive("uint8"), knownNativePlatform64), true,
  "integer constant expressions fit by their exact value");
  assert.equal(csharpLiteralIsRepresentableAs(undefined, primitive("int32"), knownNativePlatform64), false, "no datum is never representable");
});

// Q89/Q90 (N5/E24): a native-int literal fit is the Host platform fact, never fixed 64-bit bounds in C#. A refused fit
// (missing premise, 32-bit and 64-bit answers differ) is not representable; the Host raises its refusal at the Source site.
test("native-int literal fits follow the Host platform premise", () => {
  const wide = numeric(3000000000, 3000000000n);
  const small = numeric(7, 7n);
  for (const kind of ["native-int", "native-uint"]) {
    assert.equal(csharpLiteralIsRepresentableAs(wide, primitive(kind), knownNativePlatform64), true, `${kind}: 64-bit premise fits`);
    assert.equal(csharpLiteralIsRepresentableAs(wide, primitive(kind), knownNativePlatform32), kind === "native-uint",
      `${kind}: 32-bit premise bounds`);
    assert.equal(csharpLiteralIsRepresentableAs(small, primitive(kind), missingNativePlatform), true,
      `${kind}: a width-independent fit needs no premise`);
  }
  assert.equal(csharpLiteralIsRepresentableAs(wide, primitive("native-int"), missingNativePlatform), false,
    "a width-dependent fit under a missing premise is not representable (refused by the Host)");
  assert.equal(csharpLiteralIsRepresentableAs(wide, primitive("int64"), missingNativePlatform), true,
    "fixed-width kinds keep the C# .NET range check");
});
