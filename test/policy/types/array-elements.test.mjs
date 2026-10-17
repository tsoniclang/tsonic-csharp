import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpInferredNumericArrayElement } from "../../../dist/policy/types/collections/array-elements.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { createCsharpTypeResolutionQueryCache } from "../../../dist/policy/types/resolution/query-cache.js";

const primitive = csharpSourcePrimitiveTargetType;
const fixed = name => Object.freeze({ carrier: primitive(name), literal: undefined, literalDefault: undefined });
const literal = (coefficient, exponent, integer, carrier = "float64", negative = false) => Object.freeze({
  carrier: primitive(carrier), literalDefault: primitive("float64"),
  literal: Object.freeze({ form: "numeric", ...(integer === undefined ? {} : { integer }),
    numeric: Object.freeze({ kind: "authored", token: Object.freeze({ coefficient, exponent, negative,
      decimalText: `${coefficient}e${exponent}` }) }) }),
});
const select = (contributions, destination, checked = primitive("float64")) =>
  selectCsharpInferredNumericArrayElement(Object.freeze(contributions), checked, destination);
const selected = (selection, name, label) => assert.equal(selection.kind === "resolved" &&
  selection.carrier.kind === "source-primitive" && selection.carrier.name === name, true, label);

for (const integer of ["int32", "uint32", "int64", "uint64", "native-int", "native-uint"]) {
  for (const reverse of [false, true]) test(`inferred float32 refuses the full ${integer} domain (${reverse})`, () => {
    const inputs = [fixed("float32"), fixed(integer)];
    const selection = select(reverse ? inputs.reverse() : inputs);
    assert.equal(selection.kind === "rejected" && selection.reason ===
      "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion.",
    true, "the inferred carrier refuses a lossy domain, not native explicit conversion");
  });
}

for (const integer of ["int8", "uint8", "int16", "uint16", "char"]) {
  for (const reverse of [false, true]) test(`float32 exactly contains ${integer} (${reverse})`, () => {
    const inputs = [fixed("float32"), fixed(integer)];
    selected(select(reverse ? inputs.reverse() : inputs), "float32", "every value of the actual narrow native domain fits");
  });
}

for (const reverse of [false, true]) {
  test(`authored binary fractions may retarget to float32 (${reverse})`, () => {
    for (const value of [literal(5n, -1n), literal(125n, -2n)]) {
      const inputs = [fixed("float32"), value];
      selected(select(reverse ? inputs.reverse() : inputs), "float32", "the exact token, not a rounded host number, proves the fit");
    }
  });
  test(`a nonbinary authored fraction keeps its actual float64 default (${reverse})`, () => {
    const inputs = [fixed("float32"), literal(1n, -1n)];
    selected(select(reverse ? inputs.reverse() : inputs), "float64", "0.1 is not silently rounded to float32");
  });
  test(`a genuine computed float64 remains fixed (${reverse})`, () => {
    const inputs = [fixed("float32"), Object.freeze({ carrier: primitive("float64"), literalDefault: undefined,
      literal: Object.freeze({ form: "numeric", number: 0.5, numeric: Object.freeze({ kind: "checked-float64", value: 0.5 }) }) })];
    selected(select(reverse ? inputs.reverse() : inputs), "float64", "checked float64 is not adaptable authored token evidence");
  });
}

test("actual explicit numeric destinations preserve native conversions instead of inferred exactness", () => {
  selected(select([fixed("float32"), fixed("int32")], primitive("float64")), "float64", "number[] is an actual f64 destination");
  selected(select([fixed("float32"), fixed("int32")], primitive("float32")), "float32", "an authored float32[] retains native rounding");
});

test("an inexact integer literal never creates a new inferred float/integer physical union", () => {
  const onePastPrecision = literal(16777217n, 0n, 16777217n, "int32");
  for (const inputs of [[fixed("float32"), onePastPrecision], [onePastPrecision, fixed("float32")]]) {
    const selection = select(inputs);
    assert.equal(selection.kind === "rejected" && selection.reason ===
      "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion.", true,
    "no new physical float/int union or artificial candidate rescues a failed exact-native selection");
  }
  selected(select([fixed("float32"), onePastPrecision], primitive("float32")), "float32",
    "an actual explicit destination still authorizes the existing native rounding conversion");
});

for (const carrier of ["int32", "float64"]) test(`fitting authored integers retain a homogeneous peer (${carrier} default)`, () => {
  const one = literal(1n, 0n, 1n, carrier);
  const two = literal(2n, 0n, 2n, carrier);
  for (const contributions of [[fixed("int32"), one], [one, fixed("int32")],
    [fixed("int32"), one, two], [one, fixed("int32"), two], [one, two, fixed("int32")]]) {
    selected(select(contributions), "int32", "the whole contribution set, not source order or surface default, selects the peer");
  }
});

test("bare incompatible integer peers retain both physical arms", () => {
  for (const inputs of [[fixed("int32"), fixed("uint32")], [fixed("uint32"), fixed("int32")]]) {
    const selection = select(inputs);
    assert.equal(selection.kind === "unavailable" && selection.carriers.length === 2 &&
      selection.carriers.every((carrier, index) => carrier === inputs[index].carrier), true,
    "the existing physical-union owner receives the exact original ordered contributions");
  }
});

for (const carrier of ["int32", "float64"]) test(`flexible integer literals retain the approved third arm (${carrier} native default)`, () => {
  const one = literal(1n, 0n, 1n, carrier);
  for (const inputs of [[fixed("int32"), fixed("uint32"), one], [fixed("int32"), one, fixed("uint32")],
    [one, fixed("int32"), fixed("uint32")]]) {
    const selection = select(inputs);
    assert.equal(selection.kind === "unavailable" && selection.carriers.length === 3 &&
      new Set(selection.carriers.map(value => value.kind === "source-primitive" ? value.name : "other")).size === 3 &&
      selection.carriers.some(value => value.kind === "source-primitive" && value.name === "int32") &&
      selection.carriers.some(value => value.kind === "source-primitive" && value.name === "uint32") &&
      selection.carriers.some(value => value.kind === "source-primitive" && value.name === "float64"), true,
    "a literal's default never erases an incompatible integer peer or chooses an integer arm by order");
  }
});

test("a genuinely needed fractional contribution permits the exact existing float64 common carrier", () => {
  for (const contributions of [[fixed("int32"), fixed("uint32"), literal(5n, -1n)],
    [fixed("int32"), literal(5n, -1n), fixed("uint32")], [literal(5n, -1n), fixed("int32"), fixed("uint32")]]) {
    selected(select(contributions), "float64", "the fraction is a real f64 contribution, not a floating rescue guessed from integers");
  }
});

test("a canonical floating union arm never rounds an authored exact integer", () => {
  const exact = literal(9007199254740992n, 0n, 9007199254740992n);
  const inexact = literal(9007199254740993n, 0n, 9007199254740993n);
  for (const inputs of [[fixed("int32"), fixed("uint32"), exact], [exact, fixed("uint32"), fixed("int32")]]) {
    const selection = select(inputs);
    assert.equal(selection.kind === "unavailable" && selection.carriers.length === 3 &&
      selection.carriers.some(carrier => carrier.kind === "source-primitive" && carrier.name === "float64"), true,
    "the exact native f64 boundary is an actual valid third-arm contribution");
  }
  for (const inputs of [[fixed("int32"), fixed("uint32"), inexact], [inexact, fixed("uint32"), fixed("int32")]]) {
    const selection = select(inputs);
    assert.equal(selection.kind === "rejected" && selection.reason ===
      "An inferred numeric union requires an exact canonical carrier for every authored integer literal.", true,
    "an unavailable exact f64 arm is a precise native precision refusal, not a rounded host number");
  }
});

test("genuine checked native unions stay with the existing union owner", () => {
  const inputs = [fixed("int32"), fixed("int64")];
  const selection = select(inputs, undefined, csharpRuntimeUnionTargetType(inputs.map(input => input.carrier)));
  assert.equal(selection.kind === "unavailable" && selection.carriers.every((carrier, index) => carrier === inputs[index].carrier),
    true, "neither width is erased by a numeric inference pass");
});

test("native signed zero and integer literal range remain actual constraints", () => {
  selected(select([fixed("int32"), literal(0n, 0n, 0n, "float64", true)]), "float64", "negative zero is not integer zero evidence");
  selected(select([fixed("int32"), literal(2147483648n, 0n, 2147483648n)]), "float64", "an out-of-int32 literal retains its exact actual f64");
});

test("nonnumeric rows and input objects remain unchanged and immutable", () => {
  const carrier = Object.freeze({ kind: "array", element: primitive("int32") });
  const input = Object.freeze({ carrier, literal: undefined, literalDefault: undefined });
  const selection = select([input], undefined, carrier);
  assert.equal(selection.kind === "unavailable" && selection.carriers[0] === carrier && Object.isFrozen(selection.carriers), true,
    "the numeric selector neither rejects a nonnumeric row nor changes its source/native evidence");
  assert.equal(Object.isFrozen(input) && input.carrier === carrier, true, "the pure decision cannot mutate its contributions");
});

test("array queries preserve complete resolved, rejected and unavailable selections by source context", () => {
  const cache = createCsharpTypeResolutionQueryCache();
  const expression = {};
  const first = {};
  const second = {};
  const third = {};
  const complete = Object.freeze({ kind: "resolved", carrier: primitive("float32"), elementCarriers: Object.freeze([primitive("float32")]) });
  const rejected = Object.freeze({ kind: "rejected", reason: "exact inferred native carrier mismatch" });
  const unavailable = Object.freeze({ kind: "unavailable" });
  let computations = 0;
  for (const [file, expected] of [[first, complete], [second, rejected], [third, unavailable]]) {
    const initial = cache.resolveArrayLiteral(expression, file, true, () => { computations += 1; return expected; });
    const repeated = cache.resolveArrayLiteral(expression, file, true, () => { computations += 1; return complete; });
    assert.equal(initial === expected && repeated === expected, true, `${expected.kind}: one exact immutable query result`);
  }
  assert.equal(computations, 3, "a rejection is cached as a rejection, never a carrier miss or successful substitute");
  const bound = cache.resolveArrayLiteral(expression, second, false, () => complete);
  assert.equal(bound === complete && cache.resolveArrayLiteral(expression, second, true, () => complete) === rejected, true,
    "a bound or recursive invocation neither consumes nor overwrites the root result");
});

test("array queries never publish an in-progress nested result", () => {
  const cache = createCsharpTypeResolutionQueryCache();
  const expression = {};
  const file = {};
  const nested = Object.freeze({ kind: "unavailable" });
  const final = Object.freeze({ kind: "rejected", reason: "completed exact selection" });
  cache.resolveNode({}, file, () => {
    const selection = cache.resolveArrayLiteral(expression, file, true, () => nested);
    assert.equal(selection === nested, true, "the nested invocation sees its own result without publishing it");
    return primitive("int32");
  });
  assert.equal(cache.resolveArrayLiteral(expression, file, true, () => final) === final, true,
    "a completed outer query recomputes the final selection instead of retaining a nested partial result");
});
