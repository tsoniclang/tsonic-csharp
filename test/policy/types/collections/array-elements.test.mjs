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
  literal: Object.freeze({ form: "numeric", number: Number(`${negative ? "-" : ""}${coefficient}e${exponent}`),
    ...(integer === undefined ? {} : { integer }),
    numeric: Object.freeze({ kind: "authored", token: Object.freeze({ coefficient, exponent, negative,
      decimalText: exponent === 0n ? coefficient.toString() : `${coefficient}e${exponent}` }) }) }),
});
const select = (contributions, destination, checked = primitive("float64")) =>
  selectCsharpInferredNumericArrayElement(Object.freeze(contributions), checked, destination);
const selected = (selection, name, label) => assert.equal(selection.kind === "resolved" &&
  selection.carrier.kind === "source-primitive" && selection.carrier.name === name, true, label);

test("pure authored integer construction selects int64 before storage on every surface", () => {
  const authored = (coefficient, exponent, integer, negative = false) => {
    const input = literal(coefficient, exponent, integer, "int32", negative);
    const magnitude = Number(input.literal.numeric.token.decimalText);
    return Object.freeze({ ...input, literal: Object.freeze({ ...input.literal,
      number: negative ? -magnitude : magnitude }) });
  };
  const one = authored(1n, 0n, 1n);
  const two = authored(2n, 0n, 2n);
  const fraction = authored(15n, -1n);
  const negativeZero = authored(0n, 0n, 0n, true);
  for (const inputs of [[one], [one, two], [two, one], [negativeZero, two]]) {
    selected(select(inputs), "int64", "authored integers keep the same native default without caller evidence");
  }
  for (const inputs of [[one, fraction]]) {
    selected(select(inputs), "float64", "written floating syntax preserves its native contract");
  }
  assert.equal(Object.is(negativeZero.literal.number, -0) && one.carrier.name === "int32" &&
    one.literal.numeric.token.coefficient === 1n && Object.isFrozen(one.literal.numeric.token), true,
  "carrier selection retains immutable authored tokens, native negative zero and original input evidence");
});

test("integer construction preserves the full int64 range and rejects overflow without floating rescue", () => {
  for (const input of [literal(9007199254740993n, 0n, 9007199254740993n),
    literal(9223372036854775807n, 0n, 9223372036854775807n),
    literal(9223372036854775808n, 0n, -9223372036854775808n, "float64", true)]) {
    selected(select([input]), "int64", "exact authored magnitude is not rounded through double");
  }
  for (const input of [literal(9223372036854775808n, 0n, 9223372036854775808n),
    literal(9223372036854775809n, 0n, -9223372036854775809n, "float64", true)]) {
    const actual = select([input]);
    assert.equal(actual.kind === "rejected" && actual.reason.includes("native element range"), true,
      "an unannotated native integer cannot silently become floating or BigInteger");
  }
  const exponent = literal(1n, 1n, 10n);
  selected(select([Object.freeze({ ...exponent, literal: Object.freeze({ ...exponent.literal, number: 10 }) })]),
    "float64", "exponent notation remains authored floating even when integral");
});

test("mixed native union fallbacks retain the authored int64 carrier instead of the erased floating default", () => {
  const integer = literal(9007199254740993n, 0n, 9007199254740993n, "int64");
  const text = Object.freeze({ carrier: csharpStringTargetType(), literal: undefined, literalDefault: undefined });
  const absent = Object.freeze({ carrier: csharpAbsenceTargetType(), literal: undefined, literalDefault: undefined });
  for (const inputs of [[text, integer], [integer, text], [absent, integer], [integer, absent]]) {
    const actual = select(inputs);
    assert.equal(actual.kind === "unavailable" && actual.carriers.length === inputs.length &&
      actual.carriers.every((carrier, index) => carrier === inputs[index].carrier), true,
    "ordinary nonnumeric/absence arms do not round or replace the exact existing native integer arm");
  }
  for (const value of [literal(1n, 0n, 1n), literal(9007199254740993n, 0n, 9007199254740993n)]) {
    const signed = fixed("int32");
    const unsigned = fixed("uint32");
    const actual = select([signed, unsigned, value]);
    assert.equal(actual.kind === "unavailable" && actual.carriers.length === 3 &&
      actual.carriers[0] === signed.carrier && actual.carriers[1] === unsigned.carrier &&
      actual.carriers[2].kind === "source-primitive" && actual.carriers[2].name === "int64", true,
    "incompatible native peers retain their identity and order beside the authored int64 arm without invented floating storage");
  }
});

test("pure authored default selection requires matching checked and literal-base evidence", () => {
  const input = literal(1n, 0n, 1n, "int32");
  const authored = Object.freeze({ ...input, literal: Object.freeze({ ...input.literal, number: 1 }) });
  for (const [contributions, checked] of [
    [[authored], undefined],
    [[authored], csharpStringTargetType()],
    [[authored], primitive("int64")],
    [[Object.freeze({ ...authored, carrier: csharpStringTargetType() })], primitive("float64")],
    [[Object.freeze({ ...authored, carrier: csharpBooleanTargetType() })], primitive("float64")],
    [[Object.freeze({ ...authored, literalDefault: undefined })], primitive("float64")],
    [[Object.freeze({ ...authored, literalDefault: csharpStringTargetType() })], primitive("float64")],
  ]) {
    const selection = selectCsharpInferredNumericArrayElement(contributions, checked, undefined);
    assert.equal(selection.kind === "unavailable" && selection.carriers[0] === contributions[0].carrier, true,
      "missing or foreign default evidence cannot publish a guessed construction carrier");
  }
});

test("actual native peers and immediate destinations outrank authored numeric defaults", () => {
  const input = literal(1n, 0n, 1n, "int32");
  const authored = Object.freeze({ ...input, literal: Object.freeze({ ...input.literal, number: 1 }) });
  for (const name of ["int32", "int64", "uint64", "native-int", "native-uint"]) {
    const peer = fixed(name);
    for (const inputs of [[peer, authored], [authored, peer]]) {
      selected(select(inputs), name, "a completed native peer is not an unannotated authored default");
    }
    const destination = primitive(name);
    const actual = select([authored], destination);
    assert.equal(actual.kind === "resolved" && actual.carrier === destination, true,
      "the genuine immediate explicit native destination retains its original authority");
  }
  const exact = fixed("uint64");
  const original = select([exact, exact]);
  assert.equal(original.kind === "resolved" && original.carrier === exact.carrier, true,
    "metadata-backed native values are never replaced by the checked erased number default");
});

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
  selected(select([fixed("int32"), hugeLiteral()]), "float64",
    "an authored exponent supplies a real floating contribution, not an unannotated integer rescue");

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
  for (const carrier of others) for (const [value, expected] of [[literal(9007199254740993n, 0n, 9007199254740993n), "int64"],
    [literal(9007199254740993n, 0n, -9007199254740993n, "float64", true), "int64"], [literal(1n, 100n), "float64"]]) {
    const other = Object.freeze({ carrier, literal: undefined, literalDefault: undefined });
    for (const contributions of [[other, value], [value, other], [other, value, literal(5n, -1n)]]) {
      const selection = select(contributions);
      assert.equal(selection.kind === "unavailable" && selection.carriers.length === contributions.length &&
        selection.carriers.every((selected, index) => contributions[index] === value
          ? selected.kind === "source-primitive" && selected.name === expected : selected === contributions[index].carrier), true,
      "heterogeneous native/absence arms retain their identities and the integer's exact int64 arm without rounding");
    }
  }
});

test("an authored integer's actual floating default supplies an exact needed carrier, never a fabricated one", () => {
  const onePastPrecision = literal(16777217n, 0n, 16777217n, "int32");
  for (const inputs of [[fixed("float32"), onePastPrecision], [onePastPrecision, fixed("float32")]]) {
    const selection = select(inputs);
    assert.equal(selection.kind === "rejected" && selection.reason ===
      "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion.", true,
    "an int64-default token cannot invent float64 or silently round to the actual float32 peer");
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
      selection.carriers.some(value => value.kind === "source-primitive" && value.name === "int64") &&
      selection.carriers.every((selected, index) => inputs[index] === one
        ? selected.kind === "source-primitive" && selected.name === "int64" : selected === inputs[index].carrier), true,
    "the exact int64 default never erases either incompatible native peer or changes source order/identity");
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
      selection.carriers.some(carrier => carrier.kind === "source-primitive" && carrier.name === "int64"), true,
    "the exact native integer boundary is an int64 third arm, not a floating default");
  }
  for (const inputs of [[fixed("int32"), fixed("uint32"), inexact], [inexact, fixed("uint32"), fixed("int32")]]) {
    const selection = select(inputs);
    assert.equal(selection.kind === "unavailable" && selection.carriers.length === inputs.length &&
      selection.carriers.every((carrier, index) => inputs[index] === inexact
        ? carrier.kind === "source-primitive" && carrier.name === "int64" : carrier === inputs[index].carrier), true,
    "one past double precision stays exact in int64 without replacing either actual native peer");
    const floating = select([fixed("float32"), inexact]);
    assert.equal(floating.kind === "rejected", true,
      "an actual float32 peer cannot round the same exact integer or fabricate another floating carrier");
  }
});

test("every inferred physical-union fallback proves authored integer exactness", () => {
  const inexact = literal(9007199254740993n, 0n, 9007199254740993n);
  const negative = literal(9007199254740993n, 0n, -9007199254740993n, "float64", true);
  const hugeInexact = literal(1n, 100n);
  for (const [value, expected] of [[inexact, "int64"], [negative, "int64"], [hugeInexact, "float64"]]) {
    const other = Object.freeze({ carrier: Object.freeze({ kind: "array", element: primitive("int32") }),
      literal: undefined, literalDefault: undefined });
    for (const [index, inputs] of [[fixed("int32"), value], [value, fixed("int32")], [other, value],
      [fixed("int64"), value, fixed("float32")],
      [fixed("int32"), fixed("uint32"), value, literal(5n, -1n)]].entries()) {
      const checked = inputs.some(input => input.carrier.name === "int64")
        ? csharpRuntimeUnionTargetType([primitive("int64"), primitive("float32"), primitive("float64")])
        : primitive("float64");
      const selection = select(inputs, undefined, checked);
      if (index < 2 || index === 4 && expected === "float64") {
        selected(selection, expected, "a genuine canonical common native carrier preserves its exact admitted domain");
      } else {
        assert.equal(selection.kind === "unavailable" && selection.carriers.length === inputs.length &&
          selection.carriers.every((carrier, position) => inputs[position] === value
            ? carrier.kind === "source-primitive" && carrier.name === expected : carrier === inputs[position].carrier), true,
        "genuine checked unions, nonnumeric arms and fractions retain every exact native contribution without rounding");
      }
    }
    selected(select([fixed("int32"), value], primitive("float64")), "float64",
      "authored explicit f64 storage retains its native rounding contract");
  }
});

test("authored integral tokens beyond bounded integer materialization stay flexible and exact", () => {
  const hugeExact = literal(1n << 200n, 0n);
  const largeExact = literal(9007199254740994n, 0n, 9007199254740994n);
  for (const value of [hugeExact, largeExact]) {
    const direct = select([fixed("int32"), value]);
    if (value === hugeExact) {
      assert.equal(direct.kind === "rejected" && direct.reason.includes("native element range"), true,
        "an unannotated2^200 integer exceeds int64 and never silently becomes floating");
    } else selected(direct, "int64", "in-range native integers above2^53 retain their exact int64 carrier");
    for (const inputs of [[fixed("int32"), fixed("uint32"), value],
      [value, fixed("uint32"), fixed("int32")]]) {
      const selection = select(inputs);
      if (value === hugeExact) {
        assert.equal(selection.kind === "rejected" && selection.reason.includes("native element range"), true,
          "incompatible peers do not remove the unannotated integer range check");
      } else assert.equal(selection.kind === "unavailable" && selection.carriers.length === 3 &&
        new Set(selection.carriers.map(carrier => carrier.name)).size === 3 &&
        selection.carriers[inputs.indexOf(value)].name === "int64", true,
      "the exact native int64 arm retains both incompatible integer peers without a floating rescue");
    }
    selected(select([fixed("int32"), value], primitive("float64")), "float64",
      "a genuine own floating destination retains native range/precision without an artificial53-bit cap");
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
  const zero = literal(0n, 0n, 0n, "float64", true);
  selected(select([zero]), "int64", "unannotated -0 is the native integer0");
  selected(select([fixed("int32"), zero]), "int32", "integer0 fits its actual declared native peer");
  const written = Object.freeze({ ...zero, literal: Object.freeze({ ...zero.literal,
    numeric: Object.freeze({ ...zero.literal.numeric, token: Object.freeze({ ...zero.literal.numeric.token, decimalText: "0.0" }) }) }) });
  selected(select([fixed("int32"), written]), "float64", "written -0.0 retains its actual floating sign");
  selected(select([zero], primitive("float64")), "float64", "an own floating declaration retains the native negative-zero conversion");
  selected(select([fixed("int32"), literal(2147483648n, 0n, 2147483648n)]), "int64", "an out-of-int32 literal uses int64 without floating widening");
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
