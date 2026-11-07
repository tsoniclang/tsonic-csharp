import { knownNativePlatform64 } from "../../../helpers/native-integer-platform.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { csharpArrayElementIsRepresentableAs } from "../../../../dist/policy/types/collections/array-elements.js";
import { csharpLiteralIsRepresentableAs } from "../../../../dist/policy/conversions/literals.js";
import { selectCsharpConversion } from "../../../../dist/policy/conversions/core.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpBooleanTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType, csharpAbsenceTargetType, getCsharpRuntimeUnionArms } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { createCsharpSourceEvidenceTypeQueries } from "../../../../dist/analysis/source-evidence/type-queries.js";
import { createCsharpTypeDefinitionRegistry } from "../../../../dist/analysis/project-types/type-definitions.js";
import { createCsharpProviderRelationResolver } from "../../../../dist/providers/native/projection/relation-resolution.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../../dist/target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { hostProgram, representationServices } from "../../../representation/host-fixture.mjs";
import { acceptedEffectiveSource, assertPrimitiveOccurrences, assertPublishedRefusal, compileEffectiveSource, projectNodes } from "../../../helpers/source-effective-types.mjs";

const primitive = csharpSourcePrimitiveTargetType;
const fixed = name => Object.freeze({ carrier: primitive(name), literal: undefined });
const literal = (coefficient, exponent, integer, carrier = "float64", negative = false) => Object.freeze({
  carrier: primitive(carrier),
  literal: Object.freeze({ form: "numeric", number: Number(`${negative ? "-" : ""}${coefficient}e${exponent}`), ...(integer === undefined ? {} : { integer }),
    numeric: Object.freeze({ kind: "authored", token: Object.freeze({ coefficient, exponent, negative,
      decimalText: `${negative ? "-" : ""}${coefficient}e${exponent}` }) }) }),
});

function constructedElements(compiled) {
  acceptedEffectiveSource(compiled);
  return projectNodes(compiled, (node, ast) => ast.is.IsArrayLiteralExpression(node)).map(node => {
    const use = compiled.result.program.records.nativeExpression.get(node)?.use;
    assert.equal(use?.kind === "constructed", true, "each actual literal has its original admitted Native construction");
    const element = getCsharpArrayLiteralElementTargetType(use.carrier);
    assert.equal(element !== undefined, true, "the exact physical element is read from the admitted construction, not rebuilt by the fixture");
    return element;
  });
}

test("contextual scalar writes use native literal fit rather than inferred-array whole-domain exactness", () => {
  for (const surface of ["native", "js"]) {
    const compiled = compileEffectiveSource(surface, `export function run(): number {
      let value = 2.5;
      value = 3;
      return value;
    }`);
    acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "value", "float64");
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), fixed("int64"), knownNativePlatform64), false,
      `${surface}: an inferred array still cannot round the whole native int64 domain`);
    assert.equal(csharpLiteralIsRepresentableAs(literal(1n, 1000n).literal, primitive("float64"), knownNativePlatform64), false,
      `${surface}: the actual native floating range remains mandatory`);
  }
});

test("homogeneous native floating contributions retain their already-selected carrier", () => {
  for (const name of ["float32", "float64"]) {
    const inputs = Object.freeze([fixed(name), fixed(name)]);
    for (const input of inputs) assert.equal(csharpArrayElementIsRepresentableAs(input.carrier, input, knownNativePlatform64), true);
    assert.equal(inputs.every(input => input.carrier.name === name && Object.isFrozen(input)), true, "native admission leaves every chosen contribution unchanged");
  }
  const authored = literal(1n, 100n);
  const value = Object.freeze({ ...authored.literal, number: 1e100 });
  assert.equal(csharpLiteralIsRepresentableAs(value, primitive("float64"), knownNativePlatform64), true, "an explicitly selected native floating token retains its valid range");
});

test("homogeneous floating identity cannot admit an out-of-range authored literal", () => {
  const value = Object.freeze({ ...literal(1n, 1000n).literal, number: Infinity });
  for (const name of ["float32", "float64"]) assert.equal(csharpLiteralIsRepresentableAs(value, primitive(name), knownNativePlatform64), false,
    `${name}: final native literal admission is required even when the type is identical`);
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("int32"), literal(1n, 100n), knownNativePlatform64), false);
});

for (const integer of ["int32", "uint32", "int64", "uint64", "native-int", "native-uint"]) {
  for (const reverse of [false, true]) test(`inferred float32 refuses the full ${integer} domain (${reverse})`, () => {
    const inputs = [fixed("float32"), fixed(integer)];
    if (reverse) inputs.reverse();
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("float32"), input, knownNativePlatform64)), false,
      "native element admission cannot round the whole actual integer domain");
  });
}

for (const integer of ["int8", "uint8", "int16", "uint16", "char"]) {
  for (const reverse of [false, true]) test(`float32 exactly contains ${integer} (${reverse})`, () => {
    const inputs = [fixed("float32"), fixed(integer)];
    if (reverse) inputs.reverse();
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("float32"), input, knownNativePlatform64)), true,
      "the target's whole-domain lossless conversion remains independent of source inference");
  });
}

for (const reverse of [false, true]) {
  test(`authored binary fractions may retarget to float32 (${reverse})`, () => {
    const inputs = [literal(5n, -1n), literal(125n, -2n)];
    if (reverse) inputs.reverse();
    for (const input of inputs) assert.equal(csharpArrayElementIsRepresentableAs(primitive("float32"), input, knownNativePlatform64), true,
      "an already-chosen native float32 admits the exact authored binary fraction");
  });
  test(`a nonbinary authored fraction keeps its actual float64 default (${reverse})`, () => {
    const body = reverse ? "const other = 1; const value = 0.1;" : "const value = 0.1; const other = 1;";
    const compiled = compileEffectiveSource("native", `export function run(): boolean { ${body} return value > 0 && other === 1; }`);
    acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "value", "float64");
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float32"), literal(1n, -1n), knownNativePlatform64), false,
      "the target cannot silently reinterpret an inexact decimal contribution as an exact float32");
  });
  test(`a genuine computed float64 remains fixed (${reverse})`, () => {
    const inputs = [fixed("float32"), fixed("float64")];
    if (reverse) inputs.reverse();
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("float32"), input, knownNativePlatform64)), false,
      "a checked floating value is not a flexible integer literal");
  });
}

test("actual explicit numeric destinations preserve native conversions instead of inferred exactness", () => {
  for (const name of ["float32", "float64"]) {
    const conversion = selectCsharpConversion({ target: { id: "csharp" }, projectTypes: { directSupertypes: () => [] },
      providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }) }, primitive("int32"), primitive(name), "implicit");
    assert.equal(conversion.kind === "implicit" && conversion.proof === "numeric", true, `${name}: the actual native numeric conversion is preserved`);
  }
  assert.equal(csharpLiteralIsRepresentableAs(literal(16777217n, 0n, 16777217n).literal, primitive("float32"), knownNativePlatform64), true,
    "an explicitly annotated native float32 destination retains its existing rounding contract");
});

test("actual closed union destinations retain native arm admission rather than inferred integer exactness", () => {
  const compiled = compileEffectiveSource("native", `import type { int64, float32, decimal } from "@tsonic/core/types.js";
    export function wide(value: int64): (string | int64)[] { return ["text", value]; }
    export function rounded(): (string | float32)[] { return ["text", 16777217]; }
    export function exact(): (string | decimal)[] { return ["text", 9007199254740993]; }
    export function optional(): (number | undefined)[] { return [undefined, 9007199254740993]; }
  `);
  const elements = constructedElements(compiled);
  assert.equal(elements.length, 4, "all original explicit union and optional programs reach Native construction");
  for (const [index, expected] of [[0, "int64"], [1, "float32"], [2, "decimal"]]) {
    const arms = getCsharpRuntimeUnionArms(elements[index], compiled.result.program.typeDefinitions);
    assert.equal(arms?.length === 2 && arms.some(arm => arm.name === expected), true,
      `${expected}: the actual compiled physical union preserves the exact Native arm`);
  }
  assert.equal(getCsharpNullableElementTargetType(elements[3])?.name, "float64",
    "the original absent element and explicit floating destination keep one Native absence");
  for (const name of ["float32", "float64", "decimal", "int64"]) {
    const text = csharpStringTargetType();
    const scalar = primitive(name);
    const destination = csharpRuntimeUnionTargetType([text, scalar]);
    const arms = getCsharpRuntimeUnionArms(destination);
    assert.equal(arms?.length === 2 && arms.includes(text) && arms.includes(scalar), true, `${name}: actual selected union arm identities are retained`);
  }
});

test("inferred nonnumeric and absent fallback arms never authorize authored integer rounding", () => {
  for (const carrier of [csharpStringTargetType(), csharpAbsenceTargetType(), csharpBooleanTargetType()]) {
    const other = Object.freeze({ carrier, literal: undefined });
    for (const value of [literal(9007199254740993n, 0n, 9007199254740993n), literal(9007199254740993n, 0n, -9007199254740993n, "float64", true), literal(1n, 100n)]) {
      for (const inputs of [[other, value], [value, other]]) {
        assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), inputs.find(input => input === value), knownNativePlatform64), false,
          "a nonnumeric or absent neighbour cannot bypass exact native integer admission");
      }
    }
  }
});

test("an authored integer's actual floating default supplies an exact needed carrier, never a fabricated one", () => {
  const value = literal(16777217n, 0n, 16777217n, "int32");
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("float32"), value, knownNativePlatform64), false);
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), value, knownNativePlatform64), true);
  assert.equal(csharpLiteralIsRepresentableAs(value.literal, primitive("float32"), knownNativePlatform64), true,
    "the actual explicit rounding destination remains distinct from exact inference admission");
});

for (const carrier of ["int32", "float64"]) test(`fitting authored integers retain a homogeneous peer (${carrier} default)`, () => {
  const one = literal(1n, 0n, 1n, carrier);
  const two = literal(2n, 0n, 2n, carrier);
  for (const inputs of [[fixed("int32"), one], [one, fixed("int32")], [one, fixed("int32"), two]]) {
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("int32"), input, knownNativePlatform64)), true,
      "the actual authored integers fit the chosen native int32 carrier in every order");
  }
});

test("bare incompatible integer peers retain both physical arms", () => {
  for (const order of ["left, right", "right, left"]) {
    const compiled = compileEffectiveSource("native", `import type { int32, uint32 } from "@tsonic/core/types.js";
      export function run(left: int32, right: uint32): void { const values = [${order}]; void values; }`);
    assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", `[${order}]`);
    const declared = csharpRuntimeUnionTargetType([primitive("int32"), primitive("uint32")]);
    const arms = getCsharpRuntimeUnionArms(declared);
    assert.equal(arms?.length === 2 && arms.some(arm => arm.name === "int32") && arms.some(arm => arm.name === "uint32"), true,
      "the exact annotated native union still retains both physical arms rather than selecting a lossy common carrier");
    const companion = compileEffectiveSource("native", `import type { int32, uint32 } from "@tsonic/core/types.js";
      export function run(left: int32, right: uint32): (int32 | uint32)[] { const values: (int32 | uint32)[] = [${order}]; return values; }`);
    const physical = getCsharpRuntimeUnionArms(constructedElements(companion)[0], companion.result.program.typeDefinitions);
    assert.equal(physical?.length === 2 && ["int32", "uint32"].every(name => physical.some(arm => arm.name === name)), true,
      "the annotated companion retains the original compiled Native union requirement in both source orders");
  }
});

for (const carrier of ["int32", "float64"]) test(`flexible integer literals retain the approved third arm (${carrier} native default)`, () => {
  const declared = csharpRuntimeUnionTargetType([primitive("int32"), primitive("uint32"), primitive("float64")]);
  const arms = getCsharpRuntimeUnionArms(declared);
  assert.equal(arms?.length === 3 && ["int32", "uint32", "float64"].every(name => arms.some(arm => arm.name === name)), true,
    "an explicitly selected three-arm native union loses no integer peer");
  for (const order of ["left, 1, right", "1, right, left"]) {
    const compiled = compileEffectiveSource("native", `import type { int32, uint32 } from "@tsonic/core/types.js";
      export function run(left: int32, right: uint32): void { const values = [${order}]; void values; }`);
    assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", `[${order}]`);
    const companion = compileEffectiveSource("native", `import type { int32, uint32 } from "@tsonic/core/types.js";
      export function run(left: int32, right: uint32): (int32 | uint32 | number)[] {
        const values: (int32 | uint32 | number)[] = [${order}]; return values;
      }`);
    const physical = getCsharpRuntimeUnionArms(constructedElements(companion)[0], companion.result.program.typeDefinitions);
    assert.equal(physical?.length === 3 && ["int32", "uint32", "float64"].every(name => physical.some(arm => arm.name === name)), true,
      "the actual explicit three-arm Native constructor keeps the complete original physical key");
  }
});

test("a genuinely needed fractional contribution permits the exact existing float64 common carrier", () => {
  for (const inputs of [[fixed("int32"), fixed("uint32"), literal(5n, -1n)], [literal(5n, -1n), fixed("uint32"), fixed("int32")]]) {
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("float64"), input, knownNativePlatform64)), true,
      "an actually annotated double array admits every exact native input without a guessed source-type choice");
  }
  const compiled = compileEffectiveSource("native", `import type { int32, uint32 } from "@tsonic/core/types.js";
    export function run(left: int32, right: uint32): void { const values = [left, right, 0.5]; void values; }`);
  assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", "[left, right, 0.5]");
});

test("a canonical floating union arm never rounds an authored exact integer", () => {
  for (const [value, expected] of [[9007199254740992n, true], [9007199254740993n, false]]) {
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), literal(value, 0n, value), knownNativePlatform64), expected,
      "the exact native f64 boundary is checked without a host-number round trip");
  }
});

test("every inferred physical-union fallback proves authored integer exactness", () => {
  for (const value of [literal(9007199254740993n, 0n, 9007199254740993n), literal(9007199254740993n, 0n, -9007199254740993n, "float64", true), literal(1n, 100n)]) {
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), value, knownNativePlatform64), false, "no inferred arm can silently round the authored integer");
    assert.equal(csharpLiteralIsRepresentableAs(value.literal, primitive("float64"), knownNativePlatform64), true,
      "the same original token retains its explicitly annotated native rounding contract");
  }
});

test("authored integral tokens beyond bounded integer materialization stay flexible and exact", () => {
  for (const value of [literal(1n << 200n, 0n), literal(9007199254740994n, 0n, 9007199254740994n)]) {
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), value, knownNativePlatform64), true,
      "actual binary-exact values above 2^53 remain admitted without a fabricated integer materialization or cap");
  }
});

test("genuine checked native unions stay with the existing union owner", () => {
  const compiled = compileEffectiveSource("native", `import type { int32, int64, float32 } from "@tsonic/core/types.js";
    export function integer(first: int32, second: int64): (int32 | int64)[] { return [first, second]; }
    export function floating(first: float32, second: int64): (float32 | int64)[] { return [first, second]; }
  `);
  const physical = constructedElements(compiled).map(element => getCsharpRuntimeUnionArms(element, compiled.result.program.typeDefinitions));
  assert.equal(physical.length === 2 && ["int32", "int64"].every(name => physical[0]?.some(arm => arm.name === name)) &&
    ["float32", "int64"].every(name => physical[1]?.some(arm => arm.name === name)), true,
    "the original genuine Native unions are checked on the actual compiled constructions");
  for (const inputs of [[fixed("int32"), fixed("int64")], [fixed("float32"), fixed("int64")]]) {
    const arms = getCsharpRuntimeUnionArms(csharpRuntimeUnionTargetType(inputs.map(input => input.carrier)));
    assert.equal(arms?.length === 2 && inputs.every(input => arms.includes(input.carrier)), true, "explicit native union arms retain their exact actual carriers");
  }
  for (const integer of [1n, 9007199254740993n]) assert.equal(csharpArrayElementIsRepresentableAs(primitive("int64"), literal(integer, 0n, integer), knownNativePlatform64), true,
    "a fitting authored integer retains the exact native wide carrier");
});

test("native signed zero and integer literal range remain actual constraints", () => {
  const negativeZero = Object.freeze({ ...literal(0n, 0n, 0n, "float64", true).literal, number: -0 });
  // An authored -0 is the integer zero in an integral slot (C-2301 integral negative zero, token 0); float64 keeps its sign.
  assert.equal(csharpLiteralIsRepresentableAs(negativeZero, primitive("int32"), knownNativePlatform64), true);
  assert.equal(csharpLiteralIsRepresentableAs(negativeZero, primitive("float64"), knownNativePlatform64), true);
  const beyond = literal(2147483648n, 0n, 2147483648n);
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("int32"), beyond, knownNativePlatform64), false);
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), beyond, knownNativePlatform64), true);
});

test("nonnumeric rows and input objects remain unchanged and immutable", () => {
  const carrier = Object.freeze({ kind: "array", element: primitive("int32") });
  const input = Object.freeze({ carrier, literal: undefined });
  assert.equal(csharpArrayElementIsRepresentableAs(carrier, input, knownNativePlatform64), true, "an actual identical native carrier is admitted without a numeric choice");
  assert.equal(Object.isFrozen(input) && input.carrier === carrier, true, "native admission cannot mutate the contribution or its identity");
});

// The former C# array query cache (createCsharpTypeResolutionQueryCache) memoized checker-driven selections per source
// context. The target-only query resolveArrayLiteral now reads the Host descriptors directly (type-queries.ts): the same
// node gives the same frozen selection, a non-literal is unavailable, and a rejection stays a rejection.
function arrayLiteralQueries(sourceText) {
  const program = hostProgram(sourceText);
  const conversions = Object.freeze({ typeDefinitions: createCsharpTypeDefinitionRegistry(), projectTypes: { directSupertypes: () => [] },
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }), target: { id: "csharp" } });
  const unused = () => assert.fail("array literal storage reads no pointer or storage relation");
  const queries = createCsharpSourceEvidenceTypeQueries(representationServices(program),
    { pointerStorage: new Proxy({}, { get: unused }), sourceStorage: new Proxy({}, { get: unused }), conversions: () => conversions });
  return { program, queries, literals: program.nodes.filter(node => program.ast.is.IsArrayLiteralExpression(node)) };
}

test("array literal selections are recomputed from Host facts, frozen and stable per node", () => {
  const { queries, literals } = arrayLiteralQueries(`export const words: string[] = ["a", "b"];`);
  assert.equal(literals.length, 1);
  const first = queries.resolveArrayLiteral(literals[0]);
  const second = queries.resolveArrayLiteral(literals[0]);
  assert.equal(first.kind, "resolved");
  assert.deepEqual(first, second, "one deterministic selection for one Host fact");
  assert.equal(Object.isFrozen(first) && Object.isFrozen(first.elementCarriers), true);
  assert.deepEqual(first.elementCarriers.map(carrier => carrier.id), ["System.String", "System.String"]);
});

test("a non-literal node is unavailable and an elided literal is never a resolved carrier", () => {
  const { program, queries, literals } = arrayLiteralQueries(`import type { int32 } from "@tsonic/core/types.js";
export const holes: (int32 | undefined)[] = [1, , 2];`);
  assert.equal(queries.resolveArrayLiteral(program.named("holes")).kind, "unavailable");
  assert.notEqual(queries.resolveArrayLiteral(literals[0]).kind, "resolved", "an elision is not silently filled");
});
