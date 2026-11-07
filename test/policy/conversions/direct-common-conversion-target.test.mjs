import assert from "node:assert/strict";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import test from "node:test";
import { getCsharpRuntimeUnionArms, targetTypeRefKey } from "../../../dist/target-model/types/index.js";

import { publishedReturnContracts, unrepresentedReturnContract } from "../../helpers/published-return-contracts.mjs";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { selectCsharpConversion, selectCsharpFlowReadConversion } from "../../../dist/policy/conversions/index.js";
import {
  csharpDelegateTargetType,
  csharpExceptionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpNullableTargetType,
  csharpTargetNamedType,
  csharpTsValueTargetType,
  csharpRuntimeUnionTargetType,
  csharpAbsenceTargetType,
  csharpNeverTargetType,
  csharpVoidTargetType,
  csharpBigIntegerTargetType,
} from "../../../dist/policy/types/index.js";

const host = {
  projectTypes: { directSupertypes() { return []; } },
  providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  target: {},
};
const int32 = csharpSourcePrimitiveTargetType("int32");
const float64 = csharpSourcePrimitiveTargetType("float64");
const string = csharpSourcePrimitiveTargetType("string");

test("never supplies a bottom conversion without admitting void values", () => {
  const never = csharpNeverTargetType();
  assert.deepEqual(selectCsharpConversion(host, never, int32, "implicit"), { kind: "never" });
  assert.deepEqual(selectCsharpConversion(host, never, string, "implicit"), { kind: "never" });
  assert.deepEqual(selectCsharpConversion(host, never, never, "implicit"), { kind: "identity" });
  assert.equal(selectCsharpConversion(host, csharpVoidTargetType(), int32, "implicit").kind, "rejected");
  assert.equal(selectCsharpConversion(host, int32, never, "implicit").kind, "rejected");
});

test("a Host-published exact return retains its Native primitive without a common-target chooser", () => {
  const selected = publishedReturnContracts(`import type { int32 } from "@tsonic/core/types.js";
    export function run(value: int32) { return value; }`).get("run");
  assert.equal(selected.publication.type.kind === "primitive" && selected.publication.type.primitive === "int32", true);
  assert.equal(targetTypeRefEquals(selected.contract.type, int32), true,
    "Native represents the already-published int32 rather than choosing between int32 and float64");
});

// The common return type of several observed returns is a Host decision (facts.values.callableReturn). C# represents
// it and proves each return converts; it never chooses a common target (common-target inference deleted, C-2542).
test("an inferred return over int32 and number is the Host-published number; every observed return converts into it", () => {
  const selected = publishedReturnContracts(`import type { int32 } from "@tsonic/core/types.js";
    export function run(flag: boolean, value: int32) { if (flag) return value; return 1.5; }`).get("run");
  assert.equal(selected.publication.type.kind, "primitive", "the Host publishes one widened numeric return");
  assert.equal(targetTypeRefEquals(selected.contract.type, csharpSourcePrimitiveTargetType(selected.publication.type.primitive)), true,
    "Native represents exactly the published primitive");
  assert.equal(targetTypeRefEquals(selected.contract.type, float64), true, "number is float64 (native-first numerics)");
  for (const observed of [int32, float64]) {
    assert.notEqual(selectCsharpConversion(host, observed, selected.contract.type, "implicit").kind, "rejected",
      "every observed return converts into the published return");
  }
});

test("an inferred return over unrelated values is the Host sum in authored order, never a widened common target", () => {
  const selected = publishedReturnContracts(`import type { int32 } from "@tsonic/core/types.js";
    export function run(flag: boolean, value: int32) { if (flag) return value; return "none"; }`).get("run");
  assert.equal(selected.publication.type.kind, "union", "int32 and string have no common target: the Host publishes a union");
  const expected = selected.publication.type.types.map(type => type.kind === "string" ? csharpStringTargetType()
    : csharpSourcePrimitiveTargetType(type.primitive));
  assert.deepEqual(getCsharpRuntimeUnionArms(selected.contract.type).map(targetTypeRefKey), expected.map(targetTypeRefKey),
    "the runtime union arms are positional in the published order (R6, C-2459)");
  assert.equal(selectCsharpConversion(host, csharpStringTargetType(), int32, "implicit").kind, "rejected",
    "no implicit conversion joins the two returns");
});

test("unrelated Native representations cannot satisfy an existing exact return destination", () => {
  for (const [actual, target] of [[int32, string], [string, int32], [string, float64]]) {
    assert.equal(selectCsharpConversion(host, actual, target, "implicit").kind, "rejected",
      "a fixed Native destination is validated, never selected from a candidate inventory");
  }
});

test("Native return publication consumes the exact Host kind without an erased numeric baseline", () => {
  const selected = publishedReturnContracts(`import type { int32 } from "@tsonic/core/types.js";
    export function run(value: int32) { return value; }`).get("run");
  assert.equal(selected.publication.type.kind === "primitive" && selected.publication.type.primitive === "int32", true);
  assert.equal(targetTypeRefEquals(selected.contract.type, int32), true);
  assert.notEqual(targetTypeRefEquals(selected.contract.type, float64), true);
});

test("the Host-published optional return retains an unobserved absence alternative", () => {
  const selected = publishedReturnContracts(`import type { int32 } from "@tsonic/core/types.js";
    export function run(value: int32): int32 | undefined { return value; }`).get("run");
  assert.equal(selected.publication.type.kind === "optional", true);
  assert.equal(targetTypeRefEquals(selected.contract.type, csharpNullableTargetType(int32)), true);
});

// Inferred nullable numeric returns: the Host publishes the exact observed primitive with its absence; Native represents
// it (int?, long?) and never substitutes an erased float64 / BigInteger baseline. An authored return annotation wins.
test("inferred nullable numeric returns preserve exact observed storage and absence", () => {
  const selected = publishedReturnContracts(`import type { int32, int64 } from "@tsonic/core/types.js";
    export function narrow(flag: boolean, value: int32) { return flag ? value : undefined; }
    export function wide(flag: boolean, value: int64) { return flag ? value : undefined; }
    export function declared(flag: boolean, value: int32): number | undefined { return flag ? value : undefined; }
    export function mixed(flag: boolean, left: int32, right: number) { if (flag) return left; return flag ? right : undefined; }`);
  for (const [name, observed, baseline] of [["narrow", int32, float64],
    ["wide", csharpSourcePrimitiveTargetType("int64"), csharpBigIntegerTargetType()]]) {
    const actual = selected.get(name);
    assert.equal(actual.publication.type.kind, "optional", `${name}: one Source absence`);
    assert.equal(targetTypeRefEquals(actual.contract.type, csharpNullableTargetType(observed)), true,
      `${name}: the exact observed primitive keeps its absence`);
    assert.equal(targetTypeRefEquals(actual.contract.type, csharpNullableTargetType(baseline)), false,
      `${name}: no erased numeric baseline`);
  }
  assert.equal(targetTypeRefEquals(selected.get("declared").contract.type, csharpNullableTargetType(float64)), true,
    "an authored return is not narrowed to the observed int32");
  assert.equal(targetTypeRefEquals(selected.get("mixed").contract.type, csharpNullableTargetType(float64)), true,
    "int32 and number returns with absence publish number | undefined -> double?");
  assert.equal(selectCsharpConversion(host, csharpAbsenceTargetType(), selected.get("narrow").contract.type, "implicit").kind,
    "absence", "the absence alternative is retained by the Nullable carrier");
});

test("published integer results retain every Native primitive without allocating a checker bigint baseline", () => {
  const kinds = ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
    "int128", "uint128", "native-int", "native-uint"];
  const sourceName = kind => kind === "native-int" ? "nativeInt" : kind === "native-uint" ? "nativeUint" : kind;
  const selected = publishedReturnContracts(`import type { ${kinds.map(sourceName).join(", ")} } from "@tsonic/core/types.js";
    ${kinds.map(kind => `export function read_${sourceName(kind)}(value: ${sourceName(kind)}) { return value; }`).join("\n")}
    export function actualBigint(value: bigint) { return value; }`);
  const bigint = csharpBigIntegerTargetType();
  for (const kind of kinds) {
    const actual = selected.get(`read_${sourceName(kind)}`);
    assert.equal(actual.publication.type.kind === "primitive" && actual.publication.type.primitive === kind, true,
      `${kind}: the Source producer supplies the exact primitive`);
    assert.equal(targetTypeRefEquals(actual.contract.type, csharpSourcePrimitiveTargetType(kind)), true);
    assert.equal(targetTypeRefEquals(actual.contract.type, bigint), false);
  }
  assert.equal(selected.get("actualBigint").publication.type.kind === "intrinsic" &&
    selected.get("actualBigint").publication.type.intrinsic === "bigint", true);
  assert.equal(targetTypeRefEquals(selected.get("actualBigint").contract.type, bigint), true);
  assert.equal(selectCsharpConversion(host, float64, bigint, "implicit").kind, "rejected");
  const unrepresented = unrepresentedReturnContract(selected.get("read_int32"));
  assert.equal(unrepresented.kind === "rejected" &&
    unrepresented.reason === "The published return has no C# representation in this test double.", true,
  "a CSHARP_ representation refusal of the published return is reported as is (R5), never retried");
});

test("published compound returns retain exact Native elements without inferring a collection conversion", () => {
  const selected = publishedReturnContracts(`import type { int32 } from "@tsonic/core/types.js";
    interface Values<Value> { readonly value: Value; }
    export function array(value: int32[]) { return value; }
    export function nested(value: int32[][]) { return value; }
    export function tuple(value: [int32, string]) { return value; }
    export function generic(value: Values<int32>) { return value; }
    export function optionalGeneric(value: Values<int32> | undefined) { return value; }`);
  const numericArray = { kind: "array", element: float64 };
  const nativeArray = { kind: "array", element: int32 };
  assert.equal(targetTypeRefEquals(selected.get("array").contract.type, nativeArray), true);
  assert.equal(targetTypeRefEquals(selected.get("nested").contract.type, { kind: "array", element: nativeArray }), true);
  assert.equal(targetTypeRefEquals(selected.get("tuple").contract.type, { kind: "tuple", elements: [int32, csharpStringTargetType()] }), true);
  assert.equal(targetTypeRefEquals(selected.get("generic").contract.type.typeArguments?.[0], int32), true);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.get("optionalGeneric").contract.type)?.typeArguments?.[0], int32), true);
  for (const [source, baseline] of [
    [nativeArray, numericArray],
    [{ kind: "array", element: nativeArray }, { kind: "array", element: numericArray }],
    [{ kind: "tuple", elements: [int32, string] }, { kind: "tuple", elements: [float64, string] }],
    [csharpTargetNamedType("Fixture.Values", [int32], undefined, { allowsRefLikeTypeArguments: [false],}), csharpTargetNamedType("Fixture.Values", [float64], undefined, { allowsRefLikeTypeArguments: [false],})],
  ]) {
    assert.equal(selectCsharpConversion(host, source, baseline, "implicit").kind,
      source.kind === "tuple" ? "implicit" : "rejected");
  }
  for (const baseline of [
    { ...numericArray, rank: 2 },
    { kind: "array", element: string },
    csharpTargetNamedType("Other.Values", [float64], undefined, { allowsRefLikeTypeArguments: [false],}),
  ]) assert.equal(selectCsharpConversion(host, nativeArray, baseline, "implicit").kind, "rejected");
  assert.equal(selectCsharpConversion(host,
    csharpTargetNamedType("Fixture.Values", [int32], undefined, { allowsRefLikeTypeArguments: [false] }),
    csharpNullableTargetType(csharpTargetNamedType("Other.Values", [float64], undefined, { allowsRefLikeTypeArguments: [false] })),
    "implicit").kind, "rejected");
});

test("tuple conversions apply exact element conversions at equal arity", () => {
  const nullableFloat64 = csharpNullableTargetType(float64);
  assert.deepEqual(
    selectCsharpConversion(
      host,
      { kind: "tuple", elements: [string, float64] },
      { kind: "tuple", elements: [string, nullableFloat64] },
      "implicit",
    ),
    { kind: "implicit", proof: "tuple" },
  );
  assert.deepEqual(
    selectCsharpConversion(
      host,
      { kind: "tuple", elements: [string] },
      { kind: "tuple", elements: [string, nullableFloat64] },
      "implicit",
    ),
    {
      kind: "rejected",
      reason: "C# tuple conversion requires equal source and target arity.",
    },
  );
});

test("native arrays convert only through explicit target input capability", () => {
  const target = csharpTargetNamedType("Fixture.Assembly::Fixture.Sequence`1", [int32], undefined, { allowsRefLikeTypeArguments: [false], implicitArrayInputElementType: int32 });
  assert.deepEqual(
    selectCsharpConversion(
      host,
      { kind: "array", element: int32 },
      target,
      "implicit",
    ),
    { kind: "implicit", proof: "collection-interface" },
  );
  assert.equal(
    selectCsharpConversion(
      host,
      { kind: "array", element: float64 },
      target,
      "implicit",
    ).kind,
    "rejected",
  );
  assert.equal(
    selectCsharpConversion(
      host,
      { kind: "array", element: int32 },
      csharpTargetNamedType("Fixture.Assembly::Fixture.Sequence`1", [int32], undefined, { allowsRefLikeTypeArguments: [false],}),
      "implicit",
    ).kind,
    "rejected",
  );
});

test("delegate adapters retain exact contravariant parameter conversions", () => {
  const source = csharpDelegateTargetType(
    "System.Action",
    [csharpTsValueTargetType(), string, float64],
  );
  const target = csharpDelegateTargetType(
    "System.Action",
    [csharpNullableTargetType(csharpExceptionTargetType()), string, int32],
  );

  assert.deepEqual(selectCsharpConversion(host, source, target, "implicit"), {
    kind: "delegate-adapter",
    strategy: "adaptation",
    parameterConversions: [
      { kind: "js-value-box" },
      { kind: "identity" },
      { kind: "implicit", proof: "numeric" },
    ],
    returnConversion: { kind: "void-return" },
  });
});

test("delegate adapters reject parameter directions without exact implicit conversions", () => {
  const source = csharpDelegateTargetType("System.Action", [int32]);
  const target = csharpDelegateTargetType("System.Action", [string]);

  assert.equal(
    selectCsharpConversion(host, source, target, "implicit").kind,
    "rejected",
  );
});

test("delegate adapters discard target callback parameters omitted by source callbacks", () => {
  const source = csharpDelegateTargetType("System.Action", []);
  const target = csharpDelegateTargetType("System.Action", [string, int32]);

  assert.deepEqual(selectCsharpConversion(host, source, target, "implicit"), {
    kind: "delegate-adapter",
    strategy: "adaptation",
    parameterConversions: [],
    returnConversion: { kind: "void-return" },
  });
  assert.equal(
    selectCsharpConversion(host, target, source, "implicit").kind,
    "rejected",
  );
});

test("nullable target annotations retain required delegate adaptation", () => {
  const source = csharpDelegateTargetType("System.Action", [float64]);
  const target = csharpNullableTargetType(
    csharpDelegateTargetType("System.Action", [int32]),
  );

  assert.deepEqual(selectCsharpConversion(host, source, target, "implicit"), {
    kind: "delegate-adapter",
    strategy: "adaptation",
    parameterConversions: [{ kind: "implicit", proof: "numeric" }],
    returnConversion: { kind: "void-return" },
  });
});

test("flow reads project one exact runtime-union arm", () => {
  const union = csharpRuntimeUnionTargetType([int32, string]);
  assert.ok(union);
  assert.deepEqual(
    selectCsharpFlowReadConversion(host, union, string),
    {
      kind: "runtime-union-projection",
      path: [{ union, index: 1 }],
      armType: string,
      retainsAbsence: false,
    },
  );
  assert.equal(
    selectCsharpFlowReadConversion(host, union, float64).kind,
    "rejected",
  );
  const nullable = csharpNullableTargetType(union);
  assert.deepEqual(selectCsharpFlowReadConversion(host, nullable, string), {
    kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: string, retainsAbsence: false,
  });
  const optionalString = csharpNullableTargetType(string);
  assert.deepEqual(selectCsharpFlowReadConversion(host, nullable, optionalString), {
    kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: string, retainsAbsence: true,
  });
  assert.deepEqual(selectCsharpFlowReadConversion(host, union, optionalString), {
    kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: string, retainsAbsence: false,
  });
  assert.equal(selectCsharpFlowReadConversion(host, nullable, csharpNullableTargetType(float64)).kind, "rejected");
  assert.equal(selectCsharpFlowReadConversion(host, nullable, float64).kind, "rejected");
  assert.equal(selectCsharpConversion(host, nullable, string, "implicit").kind, "rejected");
});
