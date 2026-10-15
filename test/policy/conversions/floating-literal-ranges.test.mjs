import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import {
  csharpLiteralIsRepresentableAs,
  selectCsharpExactLiteralConversion,
} from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const datum = (form, number) => Object.freeze({ form, number });
const bits = new DataView(new ArrayBuffer(8));
const nextUp = value => { bits.setFloat64(0, value); bits.setBigUint64(0, bits.getBigUint64(0) + 1n); return bits.getFloat64(0); };
const nextDown = value => { bits.setFloat64(0, value); bits.setBigUint64(0, bits.getBigUint64(0) - 1n); return bits.getFloat64(0); };
const floatOverflow = 2 ** 128 - 2 ** 103;

const rows = [
  ["float32", "largest float", 3.4028234663852886e38, true],
  ["float32", "next double above the largest float", nextUp(3.4028234663852886e38), true],
  ["float32", "double below the overflow threshold", nextDown(floatOverflow), true],
  ["float32", "threshold double, printed below the threshold", floatOverflow, true],
  ["float32", "double above the overflow threshold", nextUp(floatOverflow), false],
  ["float32", "1e39", 1e39, false],
  ["float32", "largest double", Number.MAX_VALUE, false],
  ["float32", "1e-50 underflows to zero", 1e-50, true],
  ["float32", "smallest float subnormal", 2 ** -149, true],
  ["float32", "0.1", 0.1, true],
  ["decimal", "double below the decimal maximum", 7.922816251426433e28, true],
  ["decimal", "2^96 printed above the decimal maximum", 2 ** 96, false],
  ["decimal", "largest float", 3.4028234663852886e38, false],
  ["decimal", "1e300", 1e300, false],
  ["decimal", "1e-29 rounds to zero", 1e-29, true],
  ["decimal", "0.1", 0.1, true],
  ["float16", "largest half", 65504, true],
  ["float16", "65519.99 rounds to the largest half", 65519.99, true],
  ["float16", "double below the overflow threshold", nextDown(65520), true],
  ["float16", "overflow threshold", 65520, false],
  ["float16", "double above the overflow threshold", nextUp(65520), false],
  ["float16", "1e5", 1e5, false],
  ["float16", "largest safe integer", Number.MAX_SAFE_INTEGER, false],
  ["float16", "1e-10 underflows to zero", 1e-10, true],
  ["float16", "smallest half subnormal", 2 ** -24, true],
];

const expectation = (name, value, fits) => fits
  ? { kind: "resolved", recipe: { kind: "float", target: primitive(name), precision: name, value } }
  : { kind: "rejected", reason: `Source numeric literal is outside the '${name}' range.` };

test("a finite literal is selected at float32, decimal and float16 only inside the range the C# compiler and Half accept", () => {
  const mismatched = rows.flatMap(([name, label, magnitude, fits]) => [
    ["numeric", magnitude],
    ["prefix-unary", magnitude],
    ["prefix-unary", -magnitude],
  ].flatMap(([form, value]) => {
    const tag = `${name} ${form} ${value < 0 ? "-" : ""}${label}`;
    const target = primitive(name);
    const nullable = csharpNullableTargetType(target);
    return [
      [`${tag}: selection`, selectCsharpExactLiteralConversion(datum(form, value), target), expectation(name, value, fits)],
      [`${tag}: nullable selection`, selectCsharpExactLiteralConversion(datum(form, value), nullable), expectation(name, value, fits)],
      [`${tag}: representable`, csharpLiteralIsRepresentableAs(datum(form, value), target), fits],
      [`${tag}: nullable representable`, csharpLiteralIsRepresentableAs(datum(form, value), nullable), fits],
    ].filter(([, actual, expected]) => !isDeepStrictEqual(actual, expected)).map(([entry]) => entry);
  }));
  assert.deepEqual(mismatched, [], "every boundary row selects and classifies as the measured C# rule");
});

test("float64 keeps every finite literal and every target keeps refusing a datum without a finite number", () => {
  const float64 = primitive("float64");
  const failures = [Number.MAX_VALUE, 1e39, 65520, 2 ** 96, -Number.MAX_VALUE].flatMap((value) => [
    [`float64 ${value}: selection`, selectCsharpExactLiteralConversion(datum("numeric", value), float64), { kind: "source-representation" }],
    [`float64 ${value}: representable`, csharpLiteralIsRepresentableAs(datum("numeric", value), float64), true],
  ]).concat(["float16", "float32", "decimal"].map((name) => [
    `${name} without a finite number`,
    selectCsharpExactLiteralConversion(Object.freeze({ form: "numeric" }), primitive(name)),
    { kind: "rejected", reason: "C# numeric literal conversion requires an exact finite source value." },
  ])).filter(([, actual, expected]) => !isDeepStrictEqual(actual, expected)).map(([label]) => label);
  assert.deepEqual(failures, [], "float64 and the non-finite refusal are unchanged");
});
