import assert from "node:assert/strict";
import test from "node:test";
import { checkedSourceLiteralValues } from "../../helpers/source-literal-values.mjs";
import { csharpLiteralIsRepresentableAs, selectCsharpExactLiteralConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const datum = (form, fields = {}) => Object.freeze({ form, ...fields });
const select = selectCsharpExactLiteralConversion;

test("exact literal selection keeps the four outcomes and their precedence", () => {
  const seven = datum("numeric", { number: 7, integer: 7n });
  assert.deepEqual(select(seven, undefined), { kind: "not-applicable" }, "no requested target");
  assert.deepEqual(select(undefined, primitive("int64")), { kind: "not-applicable" }, "no literal datum");
  assert.deepEqual(select(datum("string", { text: "x" }), csharpStringTargetType()), { kind: "source-representation" },
    "a non-primitive target keeps the classified source literal");
  assert.deepEqual(select(datum("binary", { integerConstant: 7n }), csharpStringTargetType()), { kind: "not-applicable" },
    "a binary constant has no source literal representation at a non-primitive target");
  assert.deepEqual(select(seven, primitive("int32")),
    { kind: "resolved", recipe: { kind: "integer", target: primitive("int32"), width: "int32", value: 7n } },
    "a small native integer uses its selected native recipe");
  const parenthesizedZero = datum("parenthesized", { number: -0, integer: 0n, integerConstant: 0n });
  assert.deepEqual(select(parenthesizedZero, primitive("int32")),
    { kind: "resolved", recipe: { kind: "integer", target: primitive("int32"), width: "int32", value: 0n } },
    "parentheses preserve a scalar's exact integer evidence");
  assert.deepEqual(select(parenthesizedZero, primitive("float64")),
    { kind: "resolved", recipe: { kind: "signed-zero", target: primitive("float64"), precision: "float64" } },
    "an integer constant never fits a floating target, so signed zero applies");
  assert.deepEqual(select(datum("binary", { integerConstant: 1n << 40n }), primitive("int64")), { kind: "source-representation" },
    "a fitting binary constant precedes the wide integer recipe");
  assert.deepEqual(select(datum("binary", { integerConstant: 1n << 40n }), primitive("int32")), { kind: "not-applicable" },
    "a binary constant outside the target is not a literal conversion");
});

test("exact literal selection publishes signed-zero, integer, char and floating recipes", () => {
  const negativeZero = checkedSourceLiteralValues(["-0"])[0];
  for (const name of ["float64", "float16"]) {
    assert.deepEqual(select(negativeZero, primitive(name)),
      { kind: "resolved", recipe: { kind: "signed-zero", target: primitive(name), precision: name } }, `${name} signed zero`);
  }
  assert.deepEqual(select(negativeZero, csharpNullableTargetType(primitive("float32"))),
    { kind: "resolved", recipe: { kind: "float", target: primitive("float32"), precision: "float32", token: { significand: "0" }, negative: true } },
    "a nullable target selects at its element");
  assert.deepEqual(select(negativeZero, primitive("int32")),
    { kind: "resolved", recipe: { kind: "integer", target: primitive("int32"), width: "int32", value: 0n } },
    "-0 at an integer is the canonical integer zero");
  assert.deepEqual(select(negativeZero, primitive("decimal")),
    { kind: "resolved", recipe: { kind: "float", target: primitive("decimal"), precision: "decimal", token: { significand: "0" }, negative: true } },
    "decimal keeps the floating recipe for -0");
  assert.deepEqual(select(datum("string", { text: "a" }), primitive("char")),
    { kind: "resolved", recipe: { kind: "char", value: "a" } }, "one code unit");
  assert.deepEqual(select(datum("template", { text: "ab" }), primitive("char")),
    { kind: "rejected", reason: "C# char literals require exactly one UTF-16 code unit from TSTS/source primitive typing." });
  assert.deepEqual(select(datum("numeric", { number: 1, integer: 1n }), primitive("char")), { kind: "not-applicable" });
  assert.deepEqual(select(datum("numeric", { number: 1.5 }), primitive("float16")),
    { kind: "resolved", recipe: { kind: "float", target: primitive("float16"), precision: "float16", value: 1.5 } });
  assert.deepEqual(select(datum("numeric"), primitive("float32")),
    { kind: "not-applicable" }, "a datum without authored numeric evidence cannot fabricate a float32 token");
  assert.deepEqual(select(datum("string", { text: "1" }), primitive("decimal")), { kind: "not-applicable" });
});

test("exact literal selection publishes wide integer recipes and range refusals", () => {
  for (const [name, maximum] of [["int64", (1n << 63n) - 1n], ["uint64", (1n << 64n) - 1n], ["int128", (1n << 127n) - 1n],
    ["uint128", (1n << 128n) - 1n], ["native-int", (1n << 63n) - 1n], ["native-uint", (1n << 64n) - 1n]]) {
    assert.deepEqual(select(datum("bigint", { integer: maximum }), primitive(name)),
      { kind: "resolved", recipe: { kind: "integer", target: primitive(name), width: name, value: maximum } }, `${name} maximum`);
    assert.deepEqual(select(datum("bigint", { integer: maximum + 1n }), primitive(name)),
      { kind: "rejected", reason: `Source bigint literal is outside the exact '${name}' range.` }, `${name} above maximum`);
  }
  assert.deepEqual(select(datum("numeric", { number: 1.5 }), primitive("int64")), { kind: "not-applicable" }, "no exact integer");
});

test("small native integer recipes use exact scalar evidence without folding selected operations", () => {
  const ranges = [["int8", -128n, 127n], ["uint8", 0n, 255n], ["int16", -32768n, 32767n],
    ["uint16", 0n, 65535n], ["int32", -2147483648n, 2147483647n], ["uint32", 0n, 4294967295n]];
  for (const [name, minimum, maximum] of ranges) {
    for (const value of [minimum, 0n, maximum]) {
      const target = primitive(name);
      const literal = datum("numeric", { number: Number(value), integer: value });
      assert.deepEqual(select(literal, target),
        { kind: "resolved", recipe: { kind: "integer", target, width: name, value } }, `${name} ${value}`);
      assert.equal(csharpLiteralIsRepresentableAs(literal, target), true, `${name}: exact bounds agree`);
    }
    for (const value of [minimum - 1n, maximum + 1n]) {
      assert.equal(select(datum("numeric", { number: Number(value), integer: value }), primitive(name)).kind,
        "rejected", `${name} ${value}: not an admitted constant`);
    }
    assert.equal(select(datum("numeric", { number: 0.5 }), primitive(name)).kind, "not-applicable", `${name}: no rounding`);
  }
  for (const form of ["binary", "parenthesized"]) {
    assert.deepEqual(select(datum(form, { integerConstant: 30n }), primitive("int32")),
      { kind: "source-representation" }, `${form}: a selected operation is never replaced by its integer summary`);
  }
});

test("exact literal selections and recipes are frozen data", () => {
  const selections = [
    select(datum("bigint", { integer: 3n }), primitive("int64")),
    select(datum("string", { text: "a" }), primitive("char")),
    select(datum("template", { text: "ab" }), primitive("char")),
    select(datum("numeric", { number: 1, integer: 1n }), primitive("int32")),
    select(datum("numeric", { number: 1, integer: 1n }), undefined),
  ];
  for (const selection of selections) {
    assert.equal(Object.isFrozen(selection), true, selection.kind);
    if (selection.kind === "resolved") assert.equal(Object.isFrozen(selection.recipe), true, selection.recipe.kind);
  }
});

test("authored native float32 and decimal recipes preserve the exact token rather than its double summary", () => {
  const midpoint = (1n << 128n) - (1n << 103n);
  const decimalMax = (1n << 96n) - 1n;
  const spellings = [String(midpoint - 1n), String(midpoint), String(midpoint + 1n),
    "1.00000005960464477539062582718061255302767487140869206996285356581211090087890625",
    "9007199254740993", "-9007199254740993", `${decimalMax}.4`, `${decimalMax}.5`,
    "-0", "1e-9999999999999999999999", "(-(+1.5))"];
  const values = checkedSourceLiteralValues(spellings);
  assert.equal(values[0].number === values[1].number && values[1].number === values[2].number, true,
    "all three f32 boundary tokens share the same double summary");
  for (const [index, precision, accepted] of [[0, "float32", true], [1, "float32", false], [2, "float32", false],
    [3, "float32", true], [4, "decimal", true], [5, "decimal", true], [6, "decimal", true], [7, "decimal", false],
    [8, "float32", true], [8, "decimal", true], [9, "float32", true], [9, "decimal", true], [10, "float32", true]]) {
    const value = values[index];
    const target = primitive(precision);
    const selected = select(value, target);
    const label = `${precision} ${spellings[index]}`;
    assert.equal(selected.kind === "resolved", accepted, label);
    assert.equal(csharpLiteralIsRepresentableAs(value, target), accepted, `${label}: range selection agrees`);
    if (!accepted) {
      assert.equal(selected.reason, `Source numeric literal is outside the '${precision}' range.`, label);
      continue;
    }
    const sourceToken = value.numeric.token;
    const [significand, exponent] = sourceToken.decimalText.split("e");
    assert.deepEqual(selected.recipe, { kind: "float", target, precision,
      token: { significand, ...(exponent === undefined ? {} : { exponent }) },
      negative: sourceToken.negative }, label);
    assert.equal(Object.isFrozen(selected.recipe.token), true, `${label}: immutable native token`);
    assert.doesNotThrow(() => JSON.stringify(selected.recipe), `${label}: native syntax is JSON-safe`);
  }
});

test("an actual checked float64 value is not an authored F or M literal conversion", () => {
  for (const value of [1.000000059604644775390625, -0, 0.1]) {
    const literal = Object.freeze({ form: "numeric", number: value,
      numeric: Object.freeze({ kind: "checked-float64", value }) });
    for (const precision of ["float32", "decimal"]) {
      assert.deepEqual(select(literal, primitive(precision)), { kind: "not-applicable" }, `${precision} actual double`);
      assert.equal(csharpLiteralIsRepresentableAs(literal, primitive(precision)), false,
        `${precision}: actual float64 conversion requires its selected operation, not literal adaptation`);
    }
  }
});
