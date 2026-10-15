import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpExactLiteralConversion } from "../../../dist/policy/conversions/literals.js";
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
  assert.deepEqual(select(seven, primitive("int32")), { kind: "source-representation" }, "a narrow primitive keeps the source literal");
  const parenthesizedZero = datum("parenthesized", { number: -0, integer: 0n, integerConstant: 0n });
  assert.deepEqual(select(parenthesizedZero, primitive("int32")), { kind: "source-representation" },
    "a fitting parenthesized constant precedes the zero recipe");
  assert.deepEqual(select(parenthesizedZero, primitive("float64")),
    { kind: "resolved", recipe: { kind: "signed-zero", target: primitive("float64"), precision: "float64" } },
    "an integer constant never fits a floating target, so signed zero applies");
  assert.deepEqual(select(datum("binary", { integerConstant: 1n << 40n }), primitive("int64")), { kind: "source-representation" },
    "a fitting binary constant precedes the wide integer recipe");
  assert.deepEqual(select(datum("binary", { integerConstant: 1n << 40n }), primitive("int32")), { kind: "not-applicable" },
    "a binary constant outside the target is not a literal conversion");
});

test("exact literal selection publishes signed-zero, zero, char and floating recipes", () => {
  const negativeZero = datum("prefix-unary", { number: -0, integer: 0n });
  for (const name of ["float64", "float32", "float16"]) {
    assert.deepEqual(select(negativeZero, primitive(name)),
      { kind: "resolved", recipe: { kind: "signed-zero", target: primitive(name), precision: name } }, `${name} signed zero`);
  }
  assert.deepEqual(select(negativeZero, csharpNullableTargetType(primitive("float32"))),
    { kind: "resolved", recipe: { kind: "signed-zero", target: primitive("float32"), precision: "float32" } },
    "a nullable target selects at its element");
  assert.deepEqual(select(negativeZero, primitive("int32")), { kind: "resolved", recipe: { kind: "zero" } }, "-0 at an integer is 0");
  assert.deepEqual(select(negativeZero, primitive("decimal")),
    { kind: "resolved", recipe: { kind: "float", target: primitive("decimal"), precision: "decimal", value: -0 } },
    "decimal keeps the floating recipe for -0");
  assert.deepEqual(select(datum("string", { text: "a" }), primitive("char")),
    { kind: "resolved", recipe: { kind: "char", value: "a" } }, "one code unit");
  assert.deepEqual(select(datum("template", { text: "ab" }), primitive("char")),
    { kind: "rejected", reason: "C# char literals require exactly one UTF-16 code unit from TSTS/source primitive typing." });
  assert.deepEqual(select(datum("numeric", { number: 1, integer: 1n }), primitive("char")), { kind: "not-applicable" });
  assert.deepEqual(select(datum("numeric", { number: 1.5 }), primitive("float16")),
    { kind: "resolved", recipe: { kind: "float", target: primitive("float16"), precision: "float16", value: 1.5 } });
  assert.deepEqual(select(datum("numeric"), primitive("float32")),
    { kind: "rejected", reason: "C# numeric literal conversion requires an exact finite source value." });
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
