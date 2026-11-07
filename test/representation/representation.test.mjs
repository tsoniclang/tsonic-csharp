// The one descriptor -> TargetTypeRef mapping (I6) over Host sums (R6, A11, C-2459).
// Facts are minimal Host records: sums are given by identity, positional, authored-first.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createCsharpTypeParameterEnvironment,
  csharpRepresentationContext,
  isCsharpRefusal,
  representSourceSum,
  representSourceType,
  representSourceUnionOperations,
  representSourceUnionRole,
} from "../../dist/representation/index.js";
import {
  csharpAbsenceTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../dist/target-model/types/index.js";
import { csharpTypeProjection } from "../../dist/target-model/types/projections.js";

const node = name => Object.freeze({ kind: "fixture-node", name });
const site = node("site");
const family = node("family");
const primitive = name => Object.freeze({ kind: "primitive", primitive: name });
const absence = Object.freeze({ kind: "intrinsic", intrinsic: "absence" });
const string = Object.freeze({ kind: "string" });

// The program view that published each record: sums.sum(identity) returns exactly that record (E3, OI-LT).
const publishedSums = new Map();
function sumOf(types) {
  const arms = types.map((type, index) => Object.freeze({ role: index, type }));
  return publish(Object.freeze({
    identity: Object.freeze({ family, application: Object.freeze([]) }),
    arms: Object.freeze(arms),
    roles: Object.freeze(arms.map((_, index) => Object.freeze({ role: index, arms: Object.freeze([index]) }))),
  }), publishedSums);
}

function publish(sum, view) {
  view.set(sum.identity, sum);
  return sum;
}

function services(sums = new Map(), profile = "native", view = publishedSums) {
  const syntax = new Proxy({}, { get: (_target, key) => key === "is" || key === "as"
    ? new Proxy({}, { get: () => () => false }) : () => undefined });
  const facts = Object.freeze({
    sums: { sumOf: descriptor => sums.get(descriptor), sum: identity => {
      const record = view.get(identity);
      if (record === undefined) throw new Error("not a sum identity of this program view");
      return record;
    } },
    navigation: { identity: { identity: () => "fixture.family" } },
    values: { type: () => { throw new Error("unused"); } },
    objects: { members: () => [] },
  });
  return Object.freeze({
    facts, profile, syntax, sourceFacts: undefined,
    platform: Object.freeze({ nativeIntegerBits: 64, targetFramework: "net10.0" }),
    typeParameters: createCsharpTypeParameterEnvironment(() => ({ kind: "resolved", constraints: [] })),
    recursiveAliases: new Map(),
    genericProjections: () => [],
  });
}

const context = (sums, profile, view) => csharpRepresentationContext(services(sums, profile, view), site, "storage");
const int32 = csharpSourcePrimitiveTargetType("int32");
const uint64 = csharpSourcePrimitiveTargetType("uint64");
const bool = csharpSourcePrimitiveTargetType("bool");

test("a closed sum keeps the Host arm order; no sort and no dedupe (R6, C-2459)", () => {
  for (const order of [[primitive("int32"), string], [string, primitive("int32")]]) {
    const represented = representSourceSum(sumOf(order), context());
    assert.equal(isCsharpRefusal(represented), false);
    const arms = getCsharpRuntimeUnionArms(represented);
    assert.deepEqual(arms.map(targetTypeRefKey), order.map(type =>
      targetTypeRefKey(type.kind === "string" ? csharpStringTargetType() : int32)));
    assert.equal(represented.csharpRuntimeUnionSemantics, "source-sum");
  }
});

test("a union descriptor is represented through its published Host sum", () => {
  const union = Object.freeze({ kind: "union", types: Object.freeze([string, primitive("bool")]) });
  const represented = representSourceType(union, context(new Map([[union, sumOf(union.types)]])));
  assert.deepEqual(getCsharpRuntimeUnionArms(represented).map(targetTypeRefKey), [csharpStringTargetType(), bool].map(targetTypeRefKey));
});

test("A11 void cases: an absence arm lifts the present carrier to Nullable / reference ?", () => {
  const cases = [
    { arms: [primitive("uint64"), absence], expected: csharpNullableTargetType(uint64) },
    { arms: [absence, primitive("uint64")], expected: csharpNullableTargetType(uint64) },
    { arms: [string, absence], expected: csharpNullableTargetType(csharpStringTargetType()) },
    { arms: [absence], expected: csharpAbsenceTargetType() },
  ];
  for (const { arms, expected } of cases) {
    assert.equal(targetTypeRefEquals(representSourceSum(sumOf(arms), context()), expected), true, JSON.stringify(arms));
  }
  const both = representSourceSum(sumOf([primitive("int32"), primitive("bool"), absence]), context());
  const present = getCsharpNullableElementTargetType(both);
  assert.deepEqual(getCsharpRuntimeUnionArms(present).map(targetTypeRefKey), [int32, bool].map(targetTypeRefKey));
});

test("A11: a sum that still carries a void arm is a Host invariant breach", () => {
  assert.throws(() => representSourceSum(sumOf([primitive("uint64"), Object.freeze({ kind: "intrinsic", intrinsic: "void" })]), context()));
});

test("two arms with one .NET carrier are refused, not merged (CSHARP_UNION_ARMS_INDISTINGUISHABLE)", () => {
  const represented = representSourceSum(sumOf([primitive("int32"), primitive("int32")]), context());
  assert.equal(isCsharpRefusal(represented), true);
  assert.equal(represented.code, "CSHARP_UNION_ARMS_INDISTINGUISHABLE");
});

test("more than eight present arms is a .NET arity refusal", () => {
  const kinds = ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "float32"];
  const represented = representSourceSum(sumOf(kinds.map(primitive)), context());
  assert.equal(represented.code, "CSHARP_UNION_ARITY");
});

test("a sum with an open arm is a SourceUnionStorage projection over the Host roles", () => {
  const binder = node("T");
  const open = Object.freeze({ kind: "type-parameter", identity: "fixture:T", name: "T",
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }) });
  const environment = createCsharpTypeParameterEnvironment(() => ({ kind: "resolved", constraints: [] }));
  const base = services();
  const withBinder = Object.freeze({ ...base, typeParameters: { resolve: () => environment.resolve(open) },
    syntax: new Proxy({}, { get: (_target, key) => key === "is"
      ? new Proxy({}, { get: (_t, predicate) => value => predicate === "IsTypeParameterDeclaration" && value === binder })
      : ({ name: () => node("T-name"), text: () => "T", getSourceFile: () => node("file"), getPath: () => "/fixture.ts",
        kind: () => 1, pos: () => 10, end: () => 11 })[key] ?? (() => undefined) }) });
  const descriptor = Object.freeze({ kind: "declared", declaration: binder, typeArguments: Object.freeze([]) });
  const represented = representSourceSum(sumOf([descriptor, string]), csharpRepresentationContext(withBinder, site, "storage"));
  if (isCsharpRefusal(represented)) assert.fail(represented.message);
  const projection = csharpTypeProjection(represented)?.csharpProjection;
  assert.equal(projection?.kind, "source-union");
  assert.equal(projection.arguments.length, 2);
  assert.equal(projection.roleArguments.length, 2);
});

test("role operations: one arm of a two-arm sum reads through SourceUnionArmNOf2", () => {
  const sum = sumOf([primitive("int32"), string]);
  const storage = representSourceSum(sum, context());
  const arms = [int32, csharpStringTargetType()];
  const second = representSourceUnionRole(storage, csharpStringTargetType(), sum, arms, 1, [0, 1]);
  assert.equal(second.id, "Tsonic.CSharp.Runtime.SourceUnionArm2Of2`2");
  const operations = representSourceUnionOperations(storage, arms, sum, arms, [0, 1]);
  assert.equal(operations.id, "Tsonic.CSharp.Runtime.SourceUnionOperations2`5");
});

test("arrays: native T[] in the native profile, JSArray<T> in the JS profile", () => {
  const array = Object.freeze({ kind: "array", readonly: false, element: primitive("int32") });
  assert.equal(representSourceType(array, context()).kind, "array");
  assert.equal(representSourceType(array, context(new Map(), "js")).id, "Tsonic.CSharp.Js.JSArray`1");
});

test("symbol values need the JS profile; a function type with overloads has no delegate", () => {
  assert.equal(representSourceType(Object.freeze({ kind: "intrinsic", intrinsic: "symbol" }), context()).code, "CSHARP_SYMBOL_NATIVE");
  const signature = Object.freeze({ typeParameters: [], parameters: [], result: string });
  assert.equal(representSourceType(Object.freeze({ kind: "callable", calls: [signature, signature], constructs: [] }), context()).code,
    "CSHARP_CALLABLE_OVERLOADS");
});

test("an optional descriptor over a non-union value is the nullable carrier", () => {
  const optional = Object.freeze({ kind: "optional", value: primitive("uint64") });
  assert.equal(targetTypeRefEquals(representSourceType(optional, context()), csharpNullableTargetType(uint64)), true);
});

test("a sum record is represented only under the exact program view that published it (E3, OI-LT, K-2660)", () => {
  const original = sumOf([primitive("int32"), string]);
  const before = representSourceSum(original, context());
  assert.equal(isCsharpRefusal(before), false);
  // A second view of the same AST publishes its own record for the same family: the first view's record is foreign there.
  const secondView = new Map();
  const second = publish(Object.freeze({ ...original }), secondView);
  assert.notEqual(second, original);
  assert.throws(() => representSourceSum(original, context(undefined, undefined, secondView)), /program view that published it/);
  // A foreign program with a same-shaped family has no such identity at all.
  const foreignView = new Map();
  publish(sumOf([primitive("int32"), string]), foreignView);
  assert.throws(() => representSourceSum(original, context(undefined, undefined, foreignView)), /program view that published it/);
  // A forged record carrying a published identity is not the published record.
  const forged = Object.freeze({ ...original, arms: Object.freeze([...original.arms]) });
  assert.throws(() => representSourceSum(forged, context()), /program view that published it/);
  // The original view is unchanged after rejecting foreign input.
  const after = representSourceSum(original, context());
  assert.equal(targetTypeRefEquals(after, before), true);
});
