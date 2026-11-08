// Flow refinement (ported from the c2529 after-image to the nextgen facts, C-2542). The Host decides narrowing:
// the narrowed read has its own published descriptor (facts.values.type) and every typeof / instanceof / nullish /
// type-guard test publishes the arms it keeps (facts.relations.at, kind "test", C-2479, N3'). C# only represents the
// published narrowed descriptor (I6): no native guard folding over carriers, no constructor carrier query, no
// checked-type retry. Arms stay positional in Host order (R6).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { csharpStringTargetType, csharpSourcePrimitiveTargetType, csharpBigIntegerTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpRuntimeUnionArms } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";

function fixture(sourceText, options = {}) {
  const program = hostProgram(sourceText, options);
  const { ast, nodes } = program;
  const reads = nodes.filter(node => ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node).Expression) === "observe")
    .map(call => ast.arguments(call)[0]);
  const tests = operator => nodes.filter(node => ast.is.IsBinaryExpression(node) && ast.operatorKindName(node) === operator);
  const represent = representations(representationServices(program));
  const klass = name => program.named(name, node => ast.is.IsClassDeclaration(node));
  const parameter = () => ast.parameters(program.named("run", node => ast.is.IsFunctionDeclaration(node)))[0];
  return { ...program, reads, tests, represent, klass, parameter };
}

function testRelation(input, node) {
  const relation = input.facts.relations.at(node);
  assert.equal(relation?.kind, "test", `${input.ast.text(node)}: the Host publishes the arms the test keeps`);
  return { relation, sum: input.facts.sums.sum(relation.sum) };
}

const fixtureType = name => `global::Fixture.${name}`;

test("typeof and instanceof narrowing are Host test relations; the narrowed read is the constructor's class arm", () => {
  const input = fixture(`
declare class Pattern { test(text: string): boolean; }
declare function observe(value: unknown): void;
function run(value: string | Pattern | string[]): void {
  if (typeof value === "string") return;
  if (value instanceof Pattern) observe(value);
}
`);
  assert.equal(input.reads.length, 1);
  const pattern = input.klass("Pattern");
  const typeofTest = testRelation(input, input.tests("KindEqualsEqualsEqualsToken")[0]);
  assert.deepEqual(typeofTest.relation.whenTrue.map(index => typeofTest.sum.arms[index].type.kind), ["string"],
    "typeof selects the string arm by the declared type (N3')");
  const instance = testRelation(input, input.tests("KindInstanceOfKeyword")[0]);
  assert.deepEqual(instance.relation.whenTrue.map(index => instance.sum.arms[index].type.declaration), [pattern],
    "instanceof keeps exactly the arm whose declaration is the constructor's class; no native carrier is queried");
  const narrowed = input.type(input.reads[0]);
  assert.equal(narrowed.kind === "declared" && narrowed.declaration === pattern, true, "the narrowed read is published");
  assert.equal(represented(input.represent.value(input.reads[0])).id, fixtureType("Pattern"),
    "C# represents the published narrowed type");
});

test("literal guards on unknown keep the Host's published widths and never fold over .NET carriers", () => {
  const input = fixture(`
    declare function observe(value: unknown): void;
    function run(value: unknown): void {
      if (value === 1) observe(value);
      if (value === 1n) observe(value);
      if (value === "route") observe(value);
    }
  `);
  assert.equal(input.reads.length, 3);
  for (const read of input.reads) {
    assert.equal(input.facts.relations.at(read)?.kind === "extract-arm", false, "unknown is not a closed sum: no arm is extracted");
  }
  const carriers = input.reads.map(read => represented(input.represent.value(read)));
  const published = input.reads.map(read => input.type(read));
  for (const [index, descriptor] of published.entries()) {
    assert.equal(targetTypeRefEquals(carriers[index], represented(input.represent.type(descriptor, input.reads[index], "value"))), true,
      "the value carrier is the one mapping of the published descriptor");
  }
  assert.equal(targetTypeRefEquals(carriers[2], csharpStringTargetType()) || published[2].kind !== "string", true,
    "a string literal guard represents as string when the Host narrows to string");
});

test("narrowed reads materialize every surviving Host arm, positionally, without absence", () => {
  const input = fixture(`
    declare class Bytes { bytes: number; }
    declare class Packet { tag: string; }
    declare function observe(value: unknown): void;
    function run(value: string | number | Bytes | Packet | null): void {
      if (value == null) return;
      if (value instanceof Bytes) return;
      observe(value);
      if (typeof value === "string") observe(value);
    }
  `);
  assert.equal(input.reads.length, 2);
  const nullish = testRelation(input, input.tests("KindEqualsEqualsToken")[0]);
  assert.deepEqual(nullish.relation.whenTrue.map(index => nullish.sum.arms[index].type.kind === "intrinsic" &&
    nullish.sum.arms[index].type.intrinsic), ["absence"], "== null keeps exactly the absence arm");
  const narrowed = input.type(input.reads[0]);
  const record = input.sum(narrowed);
  const present = record.arms.map(arm => arm.type);
  assert.equal(present.some(type => type.kind === "intrinsic"), false, "absence is excluded by the Host");
  assert.equal(present.some(type => type.kind === "declared" && type.declaration === input.klass("Bytes")), false,
    "the instanceof-excluded arm is gone");
  const carrier = represented(input.represent.value(input.reads[0]));
  assert.equal(getCsharpNullableElementTargetType(carrier), undefined, "no Nullable lift without an absence arm");
  const arms = getCsharpRuntimeUnionArms(carrier);
  assert.deepEqual(arms.map(targetTypeRefKey), present.map(type => targetTypeRefKey(represented(input.represent.type(type, input.reads[0], "value")))),
    "string, number and Packet stay in Host order, each once");
  assert.equal(arms.some(arm => arm.id === fixtureType("Bytes")), false);
  assert.equal(targetTypeRefEquals(represented(input.represent.value(input.reads[1])), csharpStringTargetType()), true,
    "typeof string narrows the second read to string");
});

function guardedArray(body, options = {}) {
  return fixture(`
    declare function list(value: unknown): value is unknown[];
    declare function observe(value: unknown): void;
    function run(value: string | readonly string[] | bigint | undefined, other: unknown): void { ${body} }
  `, options);
}

test("a type-guard narrowing to the array arm cannot be widened by C#", () => {
  for (const [body, options] of [
    ["if (list(value)) observe(value);", {}],
    // Q107 (TEST-REVIEW-RC2-ITEM7 native-flow-refinement:123): the guarded element write before the observed read
    // is restored from the baseline program; the read after the write keeps the exact narrowed array carrier.
    // The baseline program uses the JS array API (`length`, a writable element after the unknown[] guard), so it is
    // checked on the js surface; the default surface rejects `length` (TS2551) and the write (TS2542).
    ["if (list(value) && value.length > 0) { value[0] = 'next'; observe(value); }", { surface: "js" }],
    ["if (!list(value)) return; observe(value);", {}],
  ]) {
    const input = guardedArray(body, options);
    assert.equal(input.reads.length, 1, body);
    const narrowed = input.type(input.reads[0]);
    assert.equal(narrowed.kind, "array", `${body}: the Host narrows to the array arm`);
    const carrier = represented(input.represent.value(input.reads[0]));
    assert.equal(getCsharpNullableElementTargetType(carrier), undefined, body);
    assert.equal(carrier.kind === "array" && targetTypeRefEquals(carrier.element, csharpStringTargetType()), true,
      `${body}: the exact array carrier, not the declared union`);
  }
});

test("guard intersections keep every surviving Host arm and its native width", () => {
  const input = guardedArray("if (list(value) || typeof value === 'bigint') observe(value);");
  const narrowed = input.type(input.reads[0]);
  const record = input.sum(narrowed);
  assert.equal(record.arms.length, 2, "array and bigint survive");
  // Q107 (TEST-REVIEW-RC2-ITEM7 native-flow-refinement:145): the two Host arms are pinned exactly: the declared
  // readonly string[] arm (element string) and the declared bigint arm.
  const hostArms = record.arms.map(arm => arm.type);
  const arrayIndex = hostArms.findIndex(type => type.kind === "array");
  const integerIndex = hostArms.findIndex(type => type.kind === "intrinsic" && type.intrinsic === "bigint");
  assert.equal(arrayIndex >= 0 && hostArms[arrayIndex].element.kind === "string", true,
    "the surviving array arm is the declared string[] arm, not the guard's unknown[]");
  assert.equal(integerIndex >= 0 && integerIndex !== arrayIndex, true, "the surviving integer arm is the declared bigint arm");
  const carrier = represented(input.represent.value(input.reads[0]));
  assert.equal(getCsharpNullableElementTargetType(carrier), undefined, "no Nullable lift: the absence arm does not survive");
  const arms = getCsharpRuntimeUnionArms(carrier);
  assert.equal(arms.length, 2);
  // Q107: each Native arm is exactly the one mapping (I6) of its own Host arm, positionally.
  assert.equal(arms.every((arm, index) =>
    targetTypeRefEquals(arm, represented(input.represent.type(hostArms[index], input.reads[0], "value")))), true,
  "every surviving Native arm is the representation of the corresponding published Host arm");
  assert.equal(arms[arrayIndex].kind === "array" && targetTypeRefEquals(arms[arrayIndex].element, csharpStringTargetType()), true,
    "the array arm keeps its exact string element carrier");
  // Q107: bigint has one native carrier, System.Numerics.BigInteger (representation/descriptors.ts:111). The
  // baseline int64 was the test's own hand-built storage carrier, not a product result.
  assert.equal(targetTypeRefEquals(arms[integerIndex], csharpBigIntegerTargetType()), true, "the bigint arm keeps its published width");
  assert.equal(arms.some(arm => targetTypeRefEquals(arm, csharpSourcePrimitiveTargetType("int64"))), false,
    "no alternative integer width is accepted");
  assert.equal(arms.some(arm => targetTypeRefEquals(arm, csharpStringTargetType())), false);
});

test("a guard on another operand cannot refine this read", () => {
  const input = guardedArray("if (list(other)) observe(value);");
  assert.equal(targetTypeRefEquals(represented(input.represent.value(input.reads[0])),
    represented(input.represent.slot(input.parameter()))), true, "the read keeps its declared storage carrier");
});

test("nominal subclass narrowing is the Host's published subclass, not the declared base", () => {
  const input = fixture(`
    class Base { base(): void {} }
    class Child extends Base { child(): void {} }
    declare function observe(value: unknown): void;
    function run(value: Base | string | undefined): void { if (value instanceof Child) observe(value); }
  `);
  const narrowed = input.type(input.reads[0]);
  assert.equal(narrowed.kind === "declared" && narrowed.declaration === input.klass("Child"), true,
    "the Host publishes the subclass for this read");
  assert.equal(represented(input.represent.value(input.reads[0])).id, fixtureType("Child"),
    "C# represents the published subclass without retrying a checked Type");
});
