import assert from "node:assert/strict";
import test from "node:test";
import { csharpArrayElementIsRepresentableAs } from "../../../../dist/policy/types/collections/array-elements.js";
import { csharpScalarLiteralIsRepresentableAs } from "../../../../dist/policy/conversions/literals.js";
import { selectCsharpConversion } from "../../../../dist/policy/conversions/core.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpBooleanTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType, csharpAbsenceTargetType, getCsharpRuntimeUnionArms } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { createNativeConversionHost } from "../../../helpers/native-conversion-host.mjs";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../../helpers/published-return-contracts.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../../dist/target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { acceptedEffectiveSource, assertPrimitiveOccurrences, assertPublishedRefusal, compileEffectiveSource, projectNodes } from "../../../helpers/source-effective-types.mjs";

const primitive = csharpSourcePrimitiveTargetType;
const fixed = name => Object.freeze({ carrier: primitive(name), literal: undefined });
const literal = (coefficient, exponent, carrier = "float64", negative = false) => Object.freeze({
  carrier: primitive(carrier),
  literal: Object.freeze({ kind: "number", value: Object.freeze({ kind: "authored", token: Object.freeze({
    coefficient, exponent, negative, decimalText: `${coefficient}e${exponent}`,
  }) }) }),
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
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), fixed("int64")), false,
      `${surface}: an inferred array still cannot round the whole native int64 domain`);
    assert.equal(csharpScalarLiteralIsRepresentableAs(literal(1n, 1000n).literal, primitive("float64")), false,
      `${surface}: the actual native floating range remains mandatory`);
  }
});

test("homogeneous native floating contributions retain their already-selected carrier", () => {
  for (const name of ["float32", "float64"]) {
    const inputs = Object.freeze([fixed(name), fixed(name)]);
    for (const input of inputs) assert.equal(csharpArrayElementIsRepresentableAs(input.carrier, input), true);
    assert.equal(inputs.every(input => input.carrier.name === name && Object.isFrozen(input)), true, "native admission leaves every chosen contribution unchanged");
  }
  const authored = literal(1n, 100n);
  const value = authored.literal;
  assert.equal(csharpScalarLiteralIsRepresentableAs(value, primitive("float64")), true, "an explicitly selected native floating token retains its valid range");
});

test("homogeneous floating identity cannot admit an out-of-range authored literal", () => {
  const value = literal(1n, 1000n).literal;
  for (const name of ["float32", "float64"]) assert.equal(csharpScalarLiteralIsRepresentableAs(value, primitive(name)), false,
    `${name}: final native literal admission is required even when the type is identical`);
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("int32"), literal(1n, 100n)), false);
});

for (const integer of ["int32", "uint32", "int64", "uint64", "native-int", "native-uint"]) {
  for (const reverse of [false, true]) test(`inferred float32 refuses the full ${integer} domain (${reverse})`, () => {
    const inputs = [fixed("float32"), fixed(integer)];
    if (reverse) inputs.reverse();
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("float32"), input)), false,
      "native element admission cannot round the whole actual integer domain");
  });
}

for (const integer of ["int8", "uint8", "int16", "uint16", "char"]) {
  for (const reverse of [false, true]) test(`float32 exactly contains ${integer} (${reverse})`, () => {
    const inputs = [fixed("float32"), fixed(integer)];
    if (reverse) inputs.reverse();
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("float32"), input)), true,
      "the target's whole-domain lossless conversion remains independent of source inference");
  });
}

for (const reverse of [false, true]) {
  test(`authored binary fractions may retarget to float32 (${reverse})`, () => {
    const inputs = [literal(5n, -1n), literal(125n, -2n)];
    if (reverse) inputs.reverse();
    for (const input of inputs) assert.equal(csharpArrayElementIsRepresentableAs(primitive("float32"), input), true,
      "an already-chosen native float32 admits the exact authored binary fraction");
  });
  test(`a nonbinary authored fraction keeps its actual float64 default (${reverse})`, () => {
    const body = reverse ? "const other = 1; const value = 0.1;" : "const value = 0.1; const other = 1;";
    const compiled = compileEffectiveSource("native", `export function run(): boolean { ${body} return value > 0 && other === 1; }`);
    acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "value", "float64");
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float32"), literal(1n, -1n)), false,
      "the target cannot silently reinterpret an inexact decimal contribution as an exact float32");
  });
  test(`a genuine computed float64 remains fixed (${reverse})`, () => {
    const inputs = [fixed("float32"), fixed("float64")];
    if (reverse) inputs.reverse();
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("float32"), input)), false,
      "a checked floating value is not a flexible integer literal");
  });
}

test("actual explicit numeric destinations preserve native conversions instead of inferred exactness", () => {
  for (const name of ["float32", "float64"]) {
    const conversion = selectCsharpConversion(createNativeConversionHost(), primitive("int32"), primitive(name), "implicit");
    assert.equal(conversion.kind === "implicit" && conversion.proof === "numeric", true, `${name}: the actual native numeric conversion is preserved`);
  }
  assert.equal(csharpScalarLiteralIsRepresentableAs(literal(16777217n, 0n).literal, primitive("float32")), true,
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
    const arms = getCsharpRuntimeUnionArms(elements[index]);
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
    for (const value of [literal(9007199254740993n, 0n), literal(9007199254740993n, 0n, "float64", true), literal(1n, 100n)]) {
      for (const inputs of [[other, value], [value, other]]) {
        assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), inputs.find(input => input === value)), false,
          "a nonnumeric or absent neighbour cannot bypass exact native integer admission");
      }
    }
  }
});

test("an authored integer's actual floating default supplies an exact needed carrier, never a fabricated one", () => {
  const value = literal(16777217n, 0n, "int32");
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("float32"), value), false);
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), value), true);
  assert.equal(csharpScalarLiteralIsRepresentableAs(value.literal, primitive("float32")), true,
    "the actual explicit rounding destination remains distinct from exact inference admission");
});

for (const carrier of ["int32", "float64"]) test(`fitting authored integers retain a homogeneous peer (${carrier} default)`, () => {
  const one = literal(1n, 0n, carrier);
  const two = literal(2n, 0n, carrier);
  for (const inputs of [[fixed("int32"), one], [one, fixed("int32")], [one, fixed("int32"), two]]) {
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("int32"), input)), true,
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
    const physical = getCsharpRuntimeUnionArms(constructedElements(companion)[0]);
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
    const physical = getCsharpRuntimeUnionArms(constructedElements(companion)[0]);
    assert.equal(physical?.length === 3 && ["int32", "uint32", "float64"].every(name => physical.some(arm => arm.name === name)), true,
      "the actual explicit three-arm Native constructor keeps the complete original physical key");
  }
});

test("a genuinely needed fractional contribution permits the exact existing float64 common carrier", () => {
  for (const inputs of [[fixed("int32"), fixed("uint32"), literal(5n, -1n)], [literal(5n, -1n), fixed("uint32"), fixed("int32")]]) {
    assert.equal(inputs.every(input => csharpArrayElementIsRepresentableAs(primitive("float64"), input)), true,
      "an actually annotated double array admits every exact native input without a guessed source-type choice");
  }
  const compiled = compileEffectiveSource("native", `import type { int32, uint32 } from "@tsonic/core/types.js";
    export function run(left: int32, right: uint32): void { const values = [left, right, 0.5]; void values; }`);
  assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", "[left, right, 0.5]");
});

test("a canonical floating union arm never rounds an authored exact integer", () => {
  for (const [value, expected] of [[9007199254740992n, true], [9007199254740993n, false]]) {
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), literal(value, 0n)), expected,
      "the exact native f64 boundary is checked without a host-number round trip");
  }
});

test("every inferred physical-union fallback proves authored integer exactness", () => {
  for (const value of [literal(9007199254740993n, 0n), literal(9007199254740993n, 0n, "float64", true), literal(1n, 100n)]) {
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), value), false, "no inferred arm can silently round the authored integer");
    assert.equal(csharpScalarLiteralIsRepresentableAs(value.literal, primitive("float64")), true,
      "the same original token retains its explicitly annotated native rounding contract");
  }
});

test("authored integral tokens beyond bounded integer materialization stay flexible and exact", () => {
  for (const value of [literal(1n << 200n, 0n), literal(9007199254740994n, 0n)]) {
    assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), value), true,
      "actual binary-exact values above 2^53 remain admitted without a fabricated integer materialization or cap");
  }
});

test("genuine checked native unions stay with the existing union owner", () => {
  const compiled = compileEffectiveSource("native", `import type { int32, int64, float32 } from "@tsonic/core/types.js";
    export function integer(first: int32, second: int64): (int32 | int64)[] { return [first, second]; }
    export function floating(first: float32, second: int64): (float32 | int64)[] { return [first, second]; }
  `);
  const physical = constructedElements(compiled).map(element => getCsharpRuntimeUnionArms(element));
  assert.equal(physical.length === 2 && ["int32", "int64"].every(name => physical[0]?.some(arm => arm.name === name)) &&
    ["float32", "int64"].every(name => physical[1]?.some(arm => arm.name === name)), true,
    "the original genuine Native unions are checked on the actual compiled constructions");
  for (const inputs of [[fixed("int32"), fixed("int64")], [fixed("float32"), fixed("int64")]]) {
    const arms = getCsharpRuntimeUnionArms(csharpRuntimeUnionTargetType(inputs.map(input => input.carrier)));
    assert.equal(arms?.length === 2 && inputs.every(input => arms.includes(input.carrier)), true, "explicit native union arms retain their exact actual carriers");
  }
  for (const integer of [1n, 9007199254740993n]) assert.equal(csharpArrayElementIsRepresentableAs(primitive("int64"), literal(integer, 0n)), true,
    "a fitting authored integer retains the exact native wide carrier");
});

test("native signed zero and integer literal range remain actual constraints", () => {
  const negativeZero = literal(0n, 0n, "float64", true).literal;
  assert.equal(csharpScalarLiteralIsRepresentableAs(negativeZero, primitive("int32")), true);
  assert.equal(csharpScalarLiteralIsRepresentableAs(negativeZero, primitive("float64")), true);
  const beyond = literal(2147483648n, 0n);
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("int32"), beyond), false);
  assert.equal(csharpArrayElementIsRepresentableAs(primitive("float64"), beyond), true);
});

test("nonnumeric rows and input objects remain unchanged and immutable", () => {
  const carrier = Object.freeze({ kind: "array", element: primitive("int32") });
  const input = Object.freeze({ carrier, literal: undefined });
  assert.equal(csharpArrayElementIsRepresentableAs(carrier, input), true, "an actual identical native carrier is admitted without a numeric choice");
  assert.equal(Object.isFrozen(input) && input.carrier === carrier, true, "native admission cannot mutate the contribution or its identity");
});

function arrayView(sourceText) {
  const compiled = analyzeCsharpSource({ sourceText });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", "the genuine Native analysis publishes its single representation view");
  return compiled.analysis.value;
}

test("array queries preserve complete evidence-owned results and precise refusals by source context", () => {
  const program = arrayView(`
    export const first: number[] = [1];
    export const second: number[] = [2];
    export function inspect(label: string): void {}
  `);
  const source = program.source;
  const arrays = [];
  let declaration;
  for (const file of source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file))) {
    source.ast.forEachChild(file, function visit(node) {
      if (source.ast.is.IsArrayLiteralExpression(node)) arrays.push(node);
      if (source.ast.is.IsFunctionDeclaration(node)) declaration = node;
      source.ast.forEachChild(node, visit);
    });
  }
  assert.equal(arrays.length, 2, "two exact original array occurrences");
  const evidence = arrays.map(node => resolvedSourceValue(source.facts.values.type(node), "the original construction evidence"));
  const represented = evidence.map((value, index) => program.representation.represent(value, "value", arrays[index]));
  for (const [index, result] of represented.entries()) {
    assert.equal(result.kind, "represented");
    assert.equal(result.value.evidence === evidence[index], true, "no descriptor-only cache loses the original occurrence");
    const repeated = program.representation.represent(evidence[index], "value", arrays[index]);
    assert.equal(repeated.kind === "represented" && repeated.value === result.value, true, "one completed evidence-owned result");
  }
  assert.equal(evidence[0] !== evidence[1] && represented[0].value !== represented[1].value, true,
    "coincident physical carriers do not conflate original evidence/application identity");
  const parameter = source.ast.parameters(declaration)[0];
  const slot = resolvedSourceValue(source.facts.values.declaredSlot(parameter), "the original string slot");
  for (let attempt = 0; attempt < 2; attempt++) {
    const failure = program.representation.category(slot.type, primitive("int32"), parameter);
    assert.equal(failure.kind, "native-refused", "an exact mismatch never becomes a cache miss or successful substitute");
    assert.equal(failure.code, "CSHARP_SOURCE_CATEGORY_STORAGE_MISMATCH");
    assert.equal(failure.site === parameter, true, "the precise original site remains attached");
  }
  assert.equal(Object.hasOwn(program.types, "resolveArrayLiteral"), false, "the removed unavailable-result engine is not a compatibility path");
});

test("array queries never publish an in-progress nested result", () => {
  const program = arrayView(`
    export interface Link<Value extends Link<Value>> { next: Value; }
    export function copy<Value extends Link<Value>>(values: Value[]): Value[] { return values; }
  `);
  const source = program.source;
  const declaration = source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file))
    .flatMap(file => source.ast.statements(file)).find(node => source.ast.is.IsFunctionDeclaration(node));
  assert.equal(declaration !== undefined, true, "the original recursive array declaration");
  const original = source.facts.descriptors.typeParameter(source.ast.typeParameters(declaration)[0]);
  const slot = resolvedSourceValue(source.facts.values.declaredSlot(source.ast.parameters(declaration)[0]), "the original recursive array slot");
  const array = program.representation.represent(slot.type, "storage", declaration);
  const parameter = program.representation.parameter(original, declaration);
  assert.equal(array.kind, "represented", "the whole Native array representation completes");
  assert.equal(parameter.kind, "represented", "the original F-bound parameter is finalized");
  assert.equal(parameter.value.csharpConstraints.kind === "resolved" && parameter.value.csharpConstraints.constraints.length > 0, true,
    "a private finite recursive reference never publishes an empty completed constraint definition");
  assert.equal(array.value.carrier.kind === "array" && array.value.carrier.element.csharpConstraints?.kind === "resolved", true,
    "the completed array payload retains the finalized parameter, not an in-progress shell");
  assert.equal(program.representation.represent(slot.type, "storage", declaration).value === array.value, true,
    "only the completed outer representation enters the public cache");
});
