import assert from "node:assert/strict";
import test from "node:test";
import { checkedSourceScalarLiterals } from "../../helpers/source-literal-values.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpScalarLiteralIsRepresentableAs, selectCsharpExactLiteralConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";

const primitive = csharpSourcePrimitiveTargetType;
const integer = value => Object.freeze({ kind: "number", value: Object.freeze({ kind: "integer", value }) });
const bigint = value => Object.freeze({ kind: "bigint", value });
const string = value => Object.freeze({ kind: "string", value });
const checked = value => Object.freeze({ kind: "number", value: Object.freeze({ kind: "checked-float64", value }) });
const select = selectCsharpExactLiteralConversion;

test("exact literal selection keeps the four outcomes and their precedence", () => {
  const seven = integer(7n);
  assert.deepEqual(select(seven, primitive("float64"), undefined), { kind: "not-applicable" }, "no requested target");
  assert.deepEqual(select(undefined, primitive("float64"), primitive("int64")), { kind: "not-applicable" }, "no scalar receipt");
  assert.deepEqual(select(string("x"), csharpStringTargetType(), csharpStringTargetType()),
    { kind: "source-representation" });
  assert.deepEqual(select(integer(7n), primitive("int32"), csharpStringTargetType()), { kind: "not-applicable" },
    "an integer cannot invent a string conversion");
  assert.deepEqual(select(seven, primitive("int32"), primitive("int32")),
    { kind: "source-representation" });
  assert.deepEqual(select(checked(7), primitive("float64"), primitive("float64")), { kind: "source-representation" },
    "an actual double is not reauthored as a narrower token");
  assert.equal(select(bigint(1n << 40n), primitive("int64"), primitive("int32")).kind, "rejected");
});

test("exact literal selection publishes signed-zero, integer, char and floating recipes", () => {
  const [negativeZero, fraction] = checkedSourceScalarLiterals(["-0", "1.5"]);
  assert.deepEqual(select(negativeZero, primitive("float64"), primitive("float64")),
    { kind: "resolved", recipe: { kind: "signed-zero", target: primitive("float64"), precision: "float64" } });
  assert.deepEqual(select(negativeZero, primitive("float64"), primitive("float16")),
    { kind: "resolved", recipe: { kind: "float", target: primitive("float16"), precision: "float16", bits: 0x8000,
      token: { significand: "0" }, negative: true } });
  assert.deepEqual(select(negativeZero, primitive("float64"), csharpNullableTargetType(primitive("float32"))),
    { kind: "resolved", recipe: { kind: "float", target: primitive("float32"), precision: "float32",
      token: { significand: "0" }, negative: true } });
  assert.deepEqual(select(negativeZero, primitive("int32"), primitive("int32")),
    { kind: "resolved", recipe: { kind: "integer", target: primitive("int32"), width: "int32", value: 0n } });
  assert.deepEqual(select(negativeZero, primitive("float64"), primitive("decimal")),
    { kind: "resolved", recipe: { kind: "float", target: primitive("decimal"), precision: "decimal",
      token: { significand: "0" }, negative: true } });
  assert.deepEqual(select(string("a"), csharpStringTargetType(), primitive("char")),
    { kind: "resolved", recipe: { kind: "char", value: "a" } });
  assert.deepEqual(select(string("ab"), csharpStringTargetType(), primitive("char")),
    { kind: "rejected", reason: "C# char literals require exactly one UTF-16 code unit from original Source literal evidence." });
  assert.deepEqual(select(integer(1n), primitive("int32"), primitive("char")), { kind: "not-applicable" });
  assert.deepEqual(select(fraction, primitive("float64"), primitive("float16")),
    { kind: "resolved", recipe: { kind: "float", target: primitive("float16"), precision: "float16", bits: 0x3e00,
      token: { significand: "1.5" }, negative: false } });
  assert.deepEqual(select(undefined, primitive("float64"), primitive("float32")), { kind: "not-applicable" });
  assert.deepEqual(select(string("1"), csharpStringTargetType(), primitive("decimal")), { kind: "not-applicable" });
});

test("exact literal selection publishes wide integer recipes and range refusals", () => {
  for (const [name, maximum] of [["int64", (1n << 63n) - 1n], ["uint64", (1n << 64n) - 1n],
    ["int128", (1n << 127n) - 1n], ["uint128", (1n << 128n) - 1n],
    ["native-int", (1n << 63n) - 1n], ["native-uint", (1n << 64n) - 1n]]) {
    assert.deepEqual(select(bigint(maximum), primitive(name), primitive(name)),
      { kind: "resolved", recipe: { kind: "integer", target: primitive(name), width: name, value: maximum } }, name);
    assert.deepEqual(select(bigint(maximum + 1n), primitive(name), primitive(name)),
      { kind: "rejected", reason: `Source bigint literal is outside the exact '${name}' range.` }, name);
  }
  assert.deepEqual(select(checked(1.5), primitive("float64"), primitive("int64")), { kind: "not-applicable" });
});

test("small native integer recipes use exact scalar evidence without folding selected operations", () => {
  for (const [name, minimum, maximum] of [["int8", -128n, 127n], ["uint8", 0n, 255n],
    ["int16", -32768n, 32767n], ["uint16", 0n, 65535n], ["int32", -2147483648n, 2147483647n], ["uint32", 0n, 4294967295n]]) {
    for (const value of [minimum, 0n, maximum]) {
      const target = primitive(name);
      assert.deepEqual(select(integer(value), target, target), { kind: "source-representation" }, `${name} ${value}`);
      assert.equal(csharpScalarLiteralIsRepresentableAs(integer(value), target), true);
    }
    for (const value of [minimum - 1n, maximum + 1n]) {
      assert.equal(select(integer(value), primitive(name), primitive(name)).kind, "rejected");
    }
    assert.equal(select(checked(0.5), primitive("float64"), primitive(name)).kind, "not-applicable");
  }
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let calls: int32 = 0;
    function touch(): void { calls++; }
    export function computed(): int32 { return (touch(), 30); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.equal([...compiled.artifacts.values()].join("\n").match(/\btouch\s*\(/gu)?.length >= 2, true,
    "a scalar singleton receipt cannot remove the original call from its selected operation");
});

test("exact literal selections and recipes are frozen data", () => {
  for (const selection of [
    select(bigint(3n), primitive("int64"), primitive("int64")),
    select(string("a"), csharpStringTargetType(), primitive("char")),
    select(string("ab"), csharpStringTargetType(), primitive("char")),
    select(integer(1n), primitive("int32"), primitive("int32")),
    select(integer(1n), primitive("float64"), undefined),
  ]) {
    assert.equal(Object.isFrozen(selection), true, selection.kind);
    if (selection.kind === "resolved") assert.equal(Object.isFrozen(selection.recipe), true, selection.recipe.kind);
  }
});

test("authored native float32 and decimal recipes preserve the exact token rather than its double summary", () => {
  const midpoint = (1n << 128n) - (1n << 103n);
  const maximum = (1n << 96n) - 1n;
  const spellings = [String(midpoint - 1n), String(midpoint), String(midpoint + 1n),
    "1.00000005960464477539062582718061255302767487140869206996285356581211090087890625",
    "9007199254740993", "-9007199254740993", `${maximum}.4`, `${maximum}.5`,
    "-0", "1e-9999999999999999999999", "(-(+1.5))"];
  const values = checkedSourceScalarLiterals(spellings);
  for (const [index, precision, accepted] of [[0, "float32", true], [1, "float32", false], [2, "float32", false],
    [3, "float32", true], [4, "decimal", true], [5, "decimal", true], [6, "decimal", true], [7, "decimal", false],
    [8, "float32", true], [8, "decimal", true], [9, "float32", true], [9, "decimal", true], [10, "float32", true]]) {
    const value = values[index];
    assert.equal(value.kind === "number" && value.value.kind === "authored", true, "the actual Source token receipt");
    const target = primitive(precision);
    const selected = select(value, primitive("float64"), target);
    const label = `${precision} ${spellings[index]}`;
    assert.equal(selected.kind === "resolved", accepted, label);
    assert.equal(csharpScalarLiteralIsRepresentableAs(value, target), accepted, label);
    if (!accepted) {
      assert.equal(selected.reason, `Source numeric literal is outside the '${precision}' range.`, label);
      continue;
    }
    const token = value.value.token;
    const [significand, exponent] = token.decimalText.split("e");
    assert.deepEqual(selected.recipe, { kind: "float", target, precision,
      token: { significand, ...(exponent === undefined ? {} : { exponent }) }, negative: token.negative }, label);
    assert.equal(Object.isFrozen(selected.recipe.token), true, label);
    assert.doesNotThrow(() => JSON.stringify(selected.recipe), label);
  }
});

test("an actual checked float64 value is not an authored F or M literal conversion", () => {
  for (const value of [1.000000059604644775390625, -0, 0.1]) for (const precision of ["float32", "decimal"]) {
    assert.deepEqual(select(checked(value), primitive("float64"), primitive(precision)), { kind: "not-applicable" });
    assert.equal(csharpScalarLiteralIsRepresentableAs(checked(value), primitive(precision)), false,
      "an actual float64 conversion requires its Native operation, never an invented authored token");
  }
});

test("ordinary source values and source-less negative zero cannot invent a physical recipe", () => {
  const [ordinary, negativeZero] = checkedSourceScalarLiterals(["1.25", "-0"]);
  assert.deepEqual(select(ordinary, primitive("float64"), primitive("float64")), { kind: "source-representation" });
  assert.deepEqual(select(string("text"), csharpStringTargetType(), csharpStringTargetType()), { kind: "source-representation" });
  for (const name of ["int32", "float16", "float32", "float64", "decimal"]) {
    assert.deepEqual(select(negativeZero, undefined, primitive(name)), { kind: "not-applicable" }, name);
  }
});
