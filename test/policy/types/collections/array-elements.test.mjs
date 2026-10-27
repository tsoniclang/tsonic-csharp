import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpInferredNumericArrayElement } from "../../../../dist/policy/types/collections/array-elements.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpBooleanTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType, csharpAbsenceTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { createCsharpTypeResolutionQueryCache } from "../../../../dist/analysis/source-evidence/types/resolution/query-cache.js";

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

test("homogeneous native floating contributions retain their already-selected carrier", () => {
  const authored = literal(1n, 100n);
  const huge = Object.freeze({ ...authored, literal: Object.freeze({ ...authored.literal, number: 1e100 }) });
  for (const contributions of [[fixed("float64"), huge], [huge, fixed("float64")], [huge]]) {
    const actual = select(contributions);
    assert.equal(actual.kind === "resolved" && actual.carrier === contributions[0].carrier, true,
      "same native floating input is identity, not a new integer-to-floating conversion");
  }
  for (const carrier of ["float32", "float64"]) {
    const inputs = [fixed(carrier), fixed(carrier)];
    const actual = select(inputs);
    assert.equal(actual.kind === "resolved" && actual.carrier === inputs[0].carrier, true,
      `${carrier}: the native floating identity is retained without changing contribution metadata`);
  }
});

test("homogeneous floating identity cannot admit an out-of-range authored literal", () => {
  const authored = literal(1n, 1000n);
  const overflow = Object.freeze({ ...authored, literal: Object.freeze({ ...authored.literal, number: Infinity }) });
  assert.equal(select([fixed("float64"), overflow]).kind, "rejected",
    "an invalid native authored literal does not become an already-valid floating input");
  const narrow = Object.freeze({ ...overflow, carrier: primitive("float32") });
  assert.equal(select([fixed("float32"), narrow]).kind, "rejected",
    "the existing native float32 range refusal remains required");
  assert.equal(select([fixed("int32"), hugeLiteral()]).kind, "rejected",
    "a real integer peer still requires exact integer-to-float inference");

  function hugeLiteral() {
    const value = literal(1n, 100n);
    return Object.freeze({ ...value, literal: Object.freeze({ ...value.literal, number: 1e100 }) });
  }
});

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

test("actual closed union destinations retain native arm admission rather than inferred integer exactness", () => {
  const text = Object.freeze({ carrier: csharpStringTargetType(), literal: undefined, literalDefault: undefined });
  const absent = Object.freeze({ carrier: csharpAbsenceTargetType(), literal: undefined, literalDefault: undefined });
  for (const scalar of ["float32", "float64", "decimal", "int64"]) {
    const destination = csharpRuntimeUnionTargetType([text.carrier, primitive(scalar)]);
    assert.equal(destination !== undefined, true, `${scalar}: an existing closed native union`);
    for (const value of [literal(9007199254740993n, 0n, 9007199254740993n),
      literal(9007199254740993n, 0n, -9007199254740993n, "float64", true), literal(1n, 100n)]) {
      const contributions = Object.freeze([text, value]);
      const selection = select(contributions, destination);
      assert.equal(selection.kind === "unavailable" && selection.carriers.length === contributions.length &&
        selection.carriers.every((carrier, index) => carrier === contributions[index].carrier), true,
      `${scalar}: the canonical final conversion owns arm selection, range and explicit native rounding`);
    }
  }
  const optional = csharpNullableTargetType(primitive("float64"));
  const contributions = [absent, literal(9007199254740993n, 0n, 9007199254740993n)];
  const selection = select(contributions, optional);
  assert.equal(selection.kind === "unavailable" && selection.carriers.every((carrier, index) =>
    carrier === contributions[index].carrier), true,
  "an actual nullable destination preserves absence and the existing native floating conversion without choosing an arm");
});

test("inferred nonnumeric and absent fallback arms never authorize authored integer rounding", () => {
  const others = [csharpStringTargetType(), csharpAbsenceTargetType(), csharpBooleanTargetType()];
  for (const carrier of others) for (const value of [literal(9007199254740993n, 0n, 9007199254740993n),
    literal(9007199254740993n, 0n, -9007199254740993n, "float64", true), literal(1n, 100n)]) {
    const other = Object.freeze({ carrier, literal: undefined, literalDefault: undefined });
    for (const contributions of [[other, value], [value, other], [other, value, literal(5n, -1n)]]) {
      const selection = select(contributions);
      assert.equal(selection.kind === "rejected" && selection.reason ===
        "An inferred numeric union requires an exact canonical carrier for every authored integer literal.", true,
      "only an actual authored destination bypasses inference; a heterogeneous checked type is not such a destination");
    }
  }
});

test("an authored integer's actual floating default supplies an exact needed carrier, never a fabricated one", () => {
  const onePastPrecision = literal(16777217n, 0n, 16777217n, "int32");
  for (const inputs of [[fixed("float32"), onePastPrecision], [onePastPrecision, fixed("float32")]]) {
    selected(select(inputs), "float64", "16777217 has an actual exact f64 default and cannot be rounded to f32");
  }
  const noFloatingDefault = Object.freeze({ ...onePastPrecision, literalDefault: undefined });
  const selection = select([fixed("float32"), noFloatingDefault]);
  assert.equal(selection.kind === "rejected" && selection.reason ===
    "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion.", true,
  "a missing source default is not permission to invent a float carrier or a new physical union");
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

test("every inferred physical-union fallback proves authored integer exactness", () => {
  const inexact = literal(9007199254740993n, 0n, 9007199254740993n);
  const negative = literal(9007199254740993n, 0n, -9007199254740993n, "float64", true);
  const hugeInexact = literal(1n, 100n);
  for (const value of [inexact, negative, hugeInexact]) {
    const other = Object.freeze({ carrier: Object.freeze({ kind: "array", element: primitive("int32") }),
      literal: undefined, literalDefault: undefined });
    for (const inputs of [[fixed("int32"), value], [value, fixed("int32")], [other, value],
      [fixed("int64"), value, fixed("float32")],
      [fixed("int32"), fixed("uint32"), value, literal(5n, -1n)]]) {
      const checked = inputs.some(input => input.carrier.name === "int64")
        ? csharpRuntimeUnionTargetType([primitive("int64"), primitive("float32"), primitive("float64")])
        : primitive("float64");
      const selection = select(inputs, undefined, checked);
      assert.equal(selection.kind === "rejected" && selection.reason ===
        "An inferred numeric union requires an exact canonical carrier for every authored integer literal.", true,
      "one fixed peer, genuine checked unions, nonnumeric arms and additional fractions cannot bypass exact fallback admission");
    }
    selected(select([fixed("int32"), value], primitive("float64")), "float64",
      "authored explicit f64 storage retains its native rounding contract");
  }
});

test("authored integral tokens beyond bounded integer materialization stay flexible and exact", () => {
  const hugeExact = literal(1n << 200n, 0n);
  const largeExact = literal(9007199254740994n, 0n, 9007199254740994n);
  for (const value of [hugeExact, largeExact]) {
    selected(select([fixed("int32"), value]), "float64", "exact binary values above2^53 are not artificially capped");
    for (const inputs of [[fixed("int32"), fixed("uint32"), value],
      [value, fixed("uint32"), fixed("int32")]]) {
      const selection = select(inputs);
      assert.equal(selection.kind === "unavailable" && selection.carriers.length === 3 &&
        new Set(selection.carriers.map(carrier => carrier.name)).size === 3 &&
        selection.carriers[inputs.indexOf(value)].name === "float64", true,
      "an integer token is not a fixed floating rescue merely because its bounded integer field is absent");
    }
  }
});

test("genuine checked native unions stay with the existing union owner", () => {
  for (const inputs of [[fixed("int32"), fixed("int64")], [fixed("float32"), fixed("int64")]]) {
    const selection = select(inputs, undefined, csharpRuntimeUnionTargetType(inputs.map(input => input.carrier)));
    assert.equal(selection.kind === "unavailable" && selection.carriers.every((carrier, index) => carrier === inputs[index].carrier),
      true, "neither width nor a genuine float/integer source arm is erased or spuriously refused");
  }
  for (const value of [literal(1n, 0n, 1n), literal(9007199254740993n, 0n, 9007199254740993n)]) {
    const inputs = [fixed("int64"), value];
    selected(select(inputs, undefined, csharpRuntimeUnionTargetType(inputs.map(input => input.carrier))), "int64",
      "an exact fitting authored literal uses its single native integer peer before the genuine-union gate");
  }
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
    return { kind: "resolved", type: primitive("int32") };
  });
  assert.equal(cache.resolveArrayLiteral(expression, file, true, () => final) === final, true,
    "a completed outer query recomputes the final selection instead of retaining a nested partial result");
});
