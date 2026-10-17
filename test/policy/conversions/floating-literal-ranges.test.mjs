import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import {
  csharpLiteralIsRepresentableAs,
  selectCsharpExactLiteralConversion,
} from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";
import { checkedSourceLiteralValues } from "../../helpers/source-literal-values.mjs";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const rows = [
  ["float32", "largest float", "3.4028234663852886e38", true],
  ["float32", "next double above the largest float", "3.402823466385289e38", true],
  ["float32", "double below the overflow threshold", "3.4028235677973362e38", true],
  ["float32", "threshold double, authored below the threshold", "3.4028235677973366e38", true],
  ["float32", "double above the overflow threshold", "3.402823567797337e38", false],
  ["float32", "1e39", "1e39", false],
  ["float32", "largest double", "1.7976931348623157e308", false],
  ["float32", "1e-50 underflows to zero", "1e-50", true],
  ["float32", "smallest float subnormal", "1.40129846432481707092372958328991613128026194187651577175706828388979108268586060148663818836212158203125e-45", true],
  ["float32", "0.1", "0.1", true],
  ["decimal", "double below the decimal maximum", "7.922816251426433e28", true],
  ["decimal", "2^96 above the decimal maximum", "79228162514264337593543950336", false],
  ["decimal", "largest float", "3.4028234663852886e38", false],
  ["decimal", "1e300", "1e300", false],
  ["decimal", "1e-29 rounds to zero", "1e-29", true],
  ["decimal", "0.1", "0.1", true],
  ["float16", "largest half", "65504", true, 0x7bff],
  ["float16", "65519.99 rounds to the largest half", "65519.99", true, 0x7bff],
  ["float16", "double below the overflow threshold", "65519.99999999999", true, 0x7bff],
  ["float16", "overflow threshold", "65520", false],
  ["float16", "double above the overflow threshold", "65520.00000000001", false],
  ["float16", "1e5", "1e5", false],
  ["float16", "largest safe integer", "9007199254740991", false],
  ["float16", "1e-10 underflows to zero", "1e-10", true, 0],
  ["float16", "smallest half subnormal", "5.9604644775390625e-8", true, 0x0001],
  ["float16", "exact authored value below a double-rounded overflow midpoint", "65519.999999999999999999999", true, 0x7bff],
  ["float16", "parenthesized authored value below a double-rounded overflow midpoint", "(65519.999999999999999999999)", true, 0x7bff],
  ["float16", "exact authored value above the overflow midpoint", "65520.000000000000000000001", false],
  ["float16", "hexadecimal value below the overflow midpoint", "0xffef", true, 0x7bff],
  ["float16", "hexadecimal overflow midpoint", "0xfff0", false],
  ["float16", "an even lower significand wins an exact tie", "1.00048828125", true, 0x3c00],
  ["float16", "a token just above the tie rounds upward once", "1.0004882812500000000000000000001", true, 0x3c01],
  ["float16", "parenthesized authored value above the tie rounds upward once", "(1.0004882812500000000000000000001)", true, 0x3c01],
  ["float16", "an odd lower significand loses an exact tie", "1.00146484375", true, 0x3c02],
  ["float16", "a token just below the tie rounds downward once", "1.0014648437499999999999999999999", true, 0x3c01],
  ["float16", "the zero subnormal midpoint rounds to even", "2.98023223876953125e-8", true, 0],
  ["float16", "a token above the zero midpoint survives", "2.980232238769531250000000000001e-8", true, 0x0001],
  ["float16", "a very small authored token underflows without a host-number prerequisite", "1e-5000", true, 0],
  ["float16", "a very large authored token refuses without a host-number prerequisite", "1e9999", false],
];

function expectation(name, value, fits, halfBits) {
  if (!fits) return { kind: "rejected", reason: `Source numeric literal is outside the '${name}' range.` };
  if (name === "float16") {
    return { kind: "resolved", recipe: { kind: "float", target: primitive(name), precision: name,
      bits: halfBits | (value.numeric.token.negative ? 0x8000 : 0) } };
  }
  const [significand, exponent] = value.numeric.token.decimalText.split("e");
  return { kind: "resolved", recipe: { kind: "float", target: primitive(name), precision: name,
    token: { significand, ...(exponent === undefined ? {} : { exponent }) }, negative: value.numeric.token.negative } };
}

test("an authored literal is selected at float32, decimal and float16 only inside its measured native range", () => {
  const spellings = rows.flatMap(([, , text]) => [text, `+${text}`, `-${text}`]);
  const values = checkedSourceLiteralValues(spellings);
  const mismatched = rows.flatMap(([name, label, , fits, halfBits], row) => [0, 1, 2].flatMap(offset => {
    const value = values[row * 3 + offset];
    const tag = `${name} ${value.form} ${offset === 2 ? "-" : ""}${label}`;
    const target = primitive(name);
    const nullable = csharpNullableTargetType(target);
    return [
      [`${tag}: selection`, selectCsharpExactLiteralConversion(value, target), expectation(name, value, fits, halfBits)],
      [`${tag}: nullable selection`, selectCsharpExactLiteralConversion(value, nullable), expectation(name, value, fits, halfBits)],
      [`${tag}: representable`, csharpLiteralIsRepresentableAs(value, target), fits],
      [`${tag}: nullable representable`, csharpLiteralIsRepresentableAs(value, nullable), fits],
    ].filter(([, actual, expected]) => !isDeepStrictEqual(actual, expected)).map(([entry]) => entry);
  }));
  assert.deepEqual(mismatched, [], "all original boundary rows and exact native Half midpoints retain positive, signed and nullable coverage");
});

test("float64 keeps every finite actual value without treating it as an authored narrower literal", () => {
  const float64 = primitive("float64");
  const datum = value => Object.freeze({ form: "numeric", number: value,
    numeric: Object.freeze({ kind: "checked-float64", value }) });
  const failures = [Number.MAX_VALUE, 1e39, 65520, 2 ** 96, -Number.MAX_VALUE].flatMap(value => [
    [`float64 ${value}: selection`, selectCsharpExactLiteralConversion(datum(value), float64), { kind: "source-representation" }],
    [`float64 ${value}: representable`, csharpLiteralIsRepresentableAs(datum(value), float64), true],
  ]).concat([
    ["float16 without a finite number", selectCsharpExactLiteralConversion(Object.freeze({ form: "numeric" }), primitive("float16")),
      { kind: "rejected", reason: "C# numeric literal conversion requires an exact finite source value." }],
    ...["float32", "decimal"].flatMap(name => [
      [`${name} without authored evidence`, selectCsharpExactLiteralConversion(Object.freeze({ form: "numeric" }), primitive(name)),
        { kind: "not-applicable" }],
      [`${name} actual double is not an authored literal`, csharpLiteralIsRepresentableAs(datum(0.1), primitive(name)), false],
    ]),
  ]).filter(([, actual, expected]) => !isDeepStrictEqual(actual, expected)).map(([label]) => label);
  assert.deepEqual(failures, [], "literal admission never fabricates an authored token from an actual value");
});
