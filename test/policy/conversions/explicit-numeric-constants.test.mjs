import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpExplicitNumericConstantConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

const primitive = name => csharpSourcePrimitiveTargetType(name);

const rows = [
  ["int8", "-129", -129, false],
  ["int8", "-128.9 truncates to -128", -128.9, true],
  ["int8", "127", 127, true],
  ["int8", "128", 128, false],
  ["int8", "-Infinity", -Infinity, false],
  ["uint8", "-1", -1, false],
  ["uint8", "-1.5 truncates to -1", -1.5, false],
  ["uint8", "-0.5 truncates to 0", -0.5, true],
  ["uint8", "255.9 truncates to 255", 255.9, true],
  ["uint8", "256", 256, false],
  ["int16", "-32769", -32769, false],
  ["int16", "-32768", -32768, true],
  ["int16", "32767", 32767, true],
  ["int16", "32768", 32768, false],
  ["uint16", "-1", -1, false],
  ["uint16", "-0.5 truncates to 0", -0.5, true],
  ["uint16", "65535", 65535, true],
  ["uint16", "65536", 65536, false],
  ["int32", "-2147483649", -2147483649, false],
  ["int32", "-2147483648", -2147483648, true],
  ["int32", "2147483647.5 truncates to 2147483647", 2147483647.5, true],
  ["int32", "2147483648", 2147483648, false],
  ["int32", "Infinity", Infinity, false],
  ["uint32", "-1", -1, false],
  ["uint32", "-1.5 truncates to -1", -1.5, false],
  ["uint32", "-0.5 truncates to 0", -0.5, true],
  ["uint32", "4294967295.5 truncates to 4294967295", 4294967295.5, true],
  ["uint32", "4294967296", 4294967296, false],
  ["uint32", "Infinity", Infinity, false],
  ["int64", "-1", -1, true],
  ["int64", "double 2^64", 2 ** 64, false],
  ["int64", "bigint 2^63 - 1", (1n << 63n) - 1n, true],
  ["int64", "bigint 2^63", 1n << 63n, false],
  ["int64", "Infinity", Infinity, false],
  ["uint64", "-1", -1, false],
  ["uint64", "-0.5 truncates to 0", -0.5, true],
  ["uint64", "double 2^64", 2 ** 64, false],
  ["uint64", "bigint 2^64 - 1", (1n << 64n) - 1n, true],
  ["native-int", "-1", -1, true],
  ["native-int", "4294967296", 4294967296, true],
  ["native-int", "bigint 2^63", 1n << 63n, false],
  ["native-int", "Infinity", Infinity, false],
  ["native-uint", "-1", -1, false],
  ["native-uint", "4294967296", 4294967296, true],
  ["native-uint", "bigint 2^64 - 1", (1n << 64n) - 1n, true],
  ["native-uint", "double 2^64", 2 ** 64, false],
  ["char", "-1", -1, false],
  ["char", "-0.5 truncates to 0", -0.5, true],
  ["char", "65535", 65535, true],
  ["char", "65536", 65536, false],
  ["char", "Infinity", Infinity, false],
  ["decimal", "1.5", 1.5, true],
  ["decimal", "double below the decimal maximum", 7.922816251426433e28, true],
  ["decimal", "double 2^96", 2 ** 96, false],
  ["decimal", "1e300", 1e300, false],
  ["decimal", "Infinity", Infinity, false],
];

test("an explicit numeric conversion of a constant is refused exactly where C# rejects the constant conversion", () => {
  const mismatches = rows.flatMap(([target, label, constant, fits]) => {
    const selection = selectCsharpExplicitNumericConstantConversion(constant, primitive(target));
    const expected = fits ? undefined : `Source numeric literal is outside the '${target}' range.`;
    const actual = selection === undefined ? undefined : selection.kind === "rejected" ? selection.reason : `kind ${selection.kind}`;
    return actual === expected ? [] : [`${target} ${label}: ${actual} != ${expected}`];
  });
  assert.deepEqual(mismatches, [], "integral constants are truncated toward zero and kept in the target range, non-finite constants never fit, and decimal constants keep the decimal range");
});

test("a nullable target takes its element's constant rule", () => {
  const refused = selectCsharpExplicitNumericConstantConversion(-1, csharpNullableTargetType(primitive("uint32")));
  assert.equal(refused?.kind === "rejected" && refused.reason === "Source numeric literal is outside the 'uint32' range.", true,
    "a negative constant to uint32? is refused like uint32");
  assert.equal(selectCsharpExplicitNumericConstantConversion(1, csharpNullableTargetType(primitive("uint32"))) === undefined, true,
    "an in-range constant to uint32? is not refused");
});

test("floating targets, whose explicit constant conversions C# accepts even past their range, are left to the selected conversion", () => {
  const refused = [["float32", 1e39], ["float32", -1e39], ["float16", 70000], ["float64", 1e300], ["float64", Infinity]]
    .filter(([target, constant]) => selectCsharpExplicitNumericConstantConversion(constant, primitive(target)) !== undefined)
    .map(([target, constant]) => `${target} ${constant}`);
  assert.deepEqual(refused, [], "float32 and float16 overflow to infinity in C#, and float64 holds every constant");
});
