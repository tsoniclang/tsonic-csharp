import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpSourceAnnotationCoversRepresentation } from "../../../dist/policy/types/resolution/representation.js";
import { csharpRuntimeParameterDefault } from "../../../dist/target-model/types/parameter-defaults.js";
import { selectCsharpDefaultValueContract } from "../../../dist/policy/types/objects/binding-projection-policy.js";

import {
  selectCsharpCommonImplicitTarget,
  selectCsharpConversion,
  selectCsharpFlowReadConversion,
} from "../../../dist/policy/conversions/index.js";
import {
  csharpDelegateTargetType,
  csharpExceptionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpNullableTargetType,
  csharpTargetNamedType,
  csharpTsValueTargetType,
  csharpRuntimeUnionTargetType,
  csharpNeverTargetType,
  csharpVoidTargetType,
  csharpBigIntegerTargetType,
  csharpAbsenceTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
  csharpTaskTargetType,
} from "../../../dist/policy/types/index.js";
import {
  reconcileInferredReturnTargetContract,
} from "../../../dist/analysis/declarations/index.js";

const host = {
  projectTypes: { directSupertypes() { return []; } },
  providers: { findTargetBindingByTargetId() {} },
  target: {},
};
const int32 = csharpSourcePrimitiveTargetType("int32");
const float64 = csharpSourcePrimitiveTargetType("float64");
const string = csharpSourcePrimitiveTargetType("string");

test("contextual default input metadata never admits an invalid native incoming-to-body conversion", () => {
  const wide = csharpSourcePrimitiveTargetType("int64");
  for (const [name, value, incoming, reason] of [
    ["tuple width", { kind: "tuple", elements: [int32] },
      csharpNullableTargetType({ kind: "tuple", elements: [wide] }),
      "C# tuple implicit conversion requires every corresponding element conversion to be applicable."],
    ["native width", int32, csharpNullableTargetType(wide)],
    ["nullable body width", csharpNullableTargetType(int32), csharpNullableTargetType(wide)],
  ]) {
    const selected = csharpRuntimeParameterDefault(value, incoming);
    assert.equal(selected?.valueType === value && selected.parameterType === incoming, true,
      `${name}: the original exact body and incoming datums remain separate`);
    const native = selectCsharpDefaultValueContract(selected.parameterType, selected.valueType, false);
    const conversion = selectCsharpConversion(host, native.present, value, "implicit");
    assert.equal(conversion.kind, "rejected", `${name}: the sole actual implicit-conversion owner refuses the original mismatch`);
    assert.equal(conversion.reason, reason ??
      `No exact C# implicit conversion relates '${targetTypeRefKey(native.present)}' to '${targetTypeRefKey(value)}'.`,
    `${name}: the original native conversion refusal is precise, not a vocabulary-level unavailable default`);
  }
  const payload = csharpTargetNamedType("Fixture.Payload", [], undefined, { allowsRefLikeTypeArguments: [] });
  const body = csharpTsValueTargetType();
  const selected = csharpRuntimeParameterDefault(body, payload);
  assert.equal(selected?.kind, "closed-value", "an actual non-nullable native input needs no fabricated absence state");
  const native = selectCsharpDefaultValueContract(selected.parameterType, selected.valueType, false);
  assert.equal(native.kind === "value" && native.source === payload && native.present === payload && native.target === body, true,
    "the already-present native argument and independent boxed body storage share one actual default contract");
  assert.equal(selectCsharpConversion(host, native.present, native.target, "implicit").kind, "js-value-box",
    "the real supported native-to-body conversion remains admitted at its existing owner");
});

test("source union coverage selects physical storage without making native generic argument order equivalent", () => {
  const checked = checkCsharpSource({ surface: "native", sourceText: `
    class NativeBox<Value> {}
    export function logical(value: string | number): void {}
    export function optional(value: string | number | undefined): void {}
    export function array(value: (string | number)[]): void {}
    export function tuple(value: [string | number, boolean]): void {}
    export function native(value: NativeBox<string | number>): void {}
    export function task(value: Promise<string | number>): void {}
  ` });
  assert.equal(checked.sourceDiagnosticsText === "", true, checked.sourceDiagnosticsText);
  const source = createTargetSourceProgram(checked.source);
  const annotations = new Map();
  const visit = node => {
    if (source.ast.is.IsFunctionDeclaration(node)) {
      const parameter = source.ast.parameters(node)[0];
      const typeNode = parameter === undefined ? undefined : source.ast.typeNode(parameter);
      if (typeNode !== undefined) annotations.set(source.ast.text(source.ast.name(node)), typeNode);
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  const ordered = csharpRuntimeUnionTargetType([string, float64]);
  const reversed = csharpRuntimeUnionTargetType([float64, string]);
  const covers = (name, annotation, actual) => {
    const node = annotations.get(name);
    assert.equal(node !== undefined, true, `${name}: actual checked authored type node`);
    const semantics = source.semantics.forNode(node);
    const type = semantics.types.authoredType(node);
    assert.equal(type !== undefined, true, `${name}: actual checked source type`);
    return csharpSourceAnnotationCoversRepresentation(type, annotation, actual, semantics, source.ast);
  };
  assert.equal(covers("logical", reversed, ordered), true, "a logical source union covers the same exact native arms");
  assert.equal(covers("optional", csharpNullableTargetType(reversed), csharpNullableTargetType(ordered)), true,
    "one native absence state stays unchanged while the present logical arms retain their actual physical order");
  assert.equal(covers("optional", csharpNullableTargetType(reversed), ordered), false,
    "physical coverage never discards the actual authored absence state");
  assert.equal(covers("array", { kind: "array", element: reversed }, { kind: "array", element: ordered }), true,
    "a source array annotation can retain its actual ordered native element carrier");
  assert.equal(covers("tuple", { kind: "tuple", elements: [reversed, csharpSourcePrimitiveTargetType("bool")] },
    { kind: "tuple", elements: [ordered, csharpSourcePrimitiveTargetType("bool")] }), true,
  "tuple positions stay ordered while their actual logical union elements retain selected arm layout");
  for (const [label, annotation, actual] of [
    ["missing arm", reversed, float64],
    ["different native width", reversed, csharpRuntimeUnionTargetType([string, int32])],
    ["different arm", reversed, csharpRuntimeUnionTargetType([string, csharpSourcePrimitiveTargetType("bool")])],
    ["extra absence", reversed, csharpNullableTargetType(ordered)],
    ["pointer", { kind: "pointer", pointee: reversed }, { kind: "pointer", pointee: ordered }],
  ]) assert.equal(covers("logical", annotation, actual), false, `${label}: logical coverage never invents a native conversion`);
  const native = element => csharpTargetNamedType("Fixture.NativeBox", [element], undefined, { allowsRefLikeTypeArguments: [false] });
  assert.equal(covers("native", native(reversed), native(ordered)), false,
    "ordinary native generic arguments keep exact physical order even when source arguments contain a union");
  assert.equal(covers("task", csharpTaskTargetType(reversed), csharpTaskTargetType(ordered)), false,
    "logical annotation coverage never introduces Task covariance");
  assert.equal(selectCsharpConversion(host, { kind: "array", element: reversed }, { kind: "array", element: ordered }, "implicit").kind,
    "rejected", "native arrays with different physical element types remain incompatible, not convertible by copying");
});

test("never supplies a bottom conversion without admitting void values", () => {
  const never = csharpNeverTargetType();
  assert.deepEqual(selectCsharpConversion(host, never, int32, "implicit"), { kind: "never" });
  assert.deepEqual(selectCsharpConversion(host, never, string, "implicit"), { kind: "never" });
  assert.deepEqual(selectCsharpConversion(host, never, never, "implicit"), { kind: "identity" });
  assert.equal(selectCsharpConversion(host, csharpVoidTargetType(), int32, "implicit").kind, "rejected");
  assert.equal(selectCsharpConversion(host, int32, never, "implicit").kind, "rejected");
});

test("common implicit target keeps an exact narrower observed return", () => {
  assert.deepEqual(
    selectCsharpCommonImplicitTarget(host, [int32], [int32, float64]),
    { kind: "resolved", target: int32 },
  );
});

test("common implicit target widens only when every observed return converts", () => {
  assert.deepEqual(
    selectCsharpCommonImplicitTarget(
      host,
      [int32, float64],
      [int32, float64],
    ),
    { kind: "resolved", target: float64 },
  );
});

test("common implicit target rejects unrelated return representations", () => {
  assert.deepEqual(
    selectCsharpCommonImplicitTarget(
      host,
      [int32, string],
      [int32, string, float64],
    ),
    {
      kind: "rejected",
      reason:
        "No exact candidate accepts every inferred C# return representation through implicit target conversions.",
    },
  );
});

test("inferred return contracts refine erased numeric baselines", () => {
  assert.deepEqual(
    reconcileInferredReturnTargetContract(host, float64, [int32], false),
    { kind: "resolved", type: int32 },
  );
});

test("inferred return contracts retain unobserved nullish alternatives", () => {
  const nullableFloat64 = csharpNullableTargetType(float64);
  assert.deepEqual(
    reconcileInferredReturnTargetContract(
      host,
      nullableFloat64,
      [int32],
      false,
    ),
    { kind: "resolved", type: csharpNullableTargetType(int32) },
  );
});

test("inferred nullable numeric returns preserve exact observed storage and absence", () => {
  for (const [baseline, observed] of [
    [float64, int32],
    [csharpBigIntegerTargetType(), csharpSourcePrimitiveTargetType("int64")],
  ]) {
    const nullable = csharpNullableTargetType(observed);
    assert.deepEqual(reconcileInferredReturnTargetContract(host, csharpNullableTargetType(baseline),
      [observed, csharpAbsenceTargetType()], false), { kind: "resolved", type: nullable });
    assert.equal(reconcileInferredReturnTargetContract(host, csharpNullableTargetType(baseline),
      [observed, csharpAbsenceTargetType()], true).kind, "rejected");
    assert.deepEqual(reconcileInferredReturnTargetContract(host, csharpNullableTargetType(baseline), [nullable], false),
      { kind: "resolved", type: nullable });
    assert.equal(reconcileInferredReturnTargetContract(host, csharpNullableTargetType(baseline), [nullable], true).kind, "rejected");
  }
  const nullableFloat = csharpNullableTargetType(float64);
  assert.deepEqual(reconcileInferredReturnTargetContract(host, nullableFloat,
    [csharpNullableTargetType(int32), nullableFloat], false), { kind: "resolved", type: nullableFloat });
});

test("inferred integer results do not allocate the checker bigint baseline", () => {
  const bigint = csharpBigIntegerTargetType();
  for (const kind of ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
    "int128", "uint128", "native-int", "native-uint"]) {
    const integer = csharpSourcePrimitiveTargetType(kind);
    assert.deepEqual(reconcileInferredReturnTargetContract(host, bigint, [integer], false),
      { kind: "resolved", type: integer });
  }
  assert.deepEqual(reconcileInferredReturnTargetContract(host, bigint, [bigint], false),
    { kind: "resolved", type: bigint });
  assert.equal(reconcileInferredReturnTargetContract(host, bigint, [float64], false).kind, "rejected");
  assert.equal(reconcileInferredReturnTargetContract(host, bigint, [int32, bigint], false).kind, "rejected");
  assert.equal(reconcileInferredReturnTargetContract(host, bigint, [int32], true).kind, "rejected");
});

test("inferred compound results retain native numeric elements without collection conversion", () => {
  const numericArray = { kind: "array", element: float64 };
  const nativeArray = { kind: "array", element: int32 };
  for (const [source, baseline] of [
    [nativeArray, numericArray],
    [{ kind: "array", element: nativeArray }, { kind: "array", element: numericArray }],
    [{ kind: "tuple", elements: [int32, string] }, { kind: "tuple", elements: [float64, string] }],
    [csharpTargetNamedType("Fixture.Values", [int32], undefined, { allowsRefLikeTypeArguments: [false],}), csharpTargetNamedType("Fixture.Values", [float64], undefined, { allowsRefLikeTypeArguments: [false],})],
  ]) {
    assert.deepEqual(reconcileInferredReturnTargetContract(host, baseline, [source], false),
      { kind: "resolved", type: source });
    assert.equal(selectCsharpConversion(host, source, baseline, "implicit").kind,
      source.kind === "tuple" ? "implicit" : "rejected");
  }
  for (const baseline of [
    { ...numericArray, rank: 2 },
    { kind: "array", element: string },
    csharpTargetNamedType("Other.Values", [float64], undefined, { allowsRefLikeTypeArguments: [false],}),
  ]) assert.equal(reconcileInferredReturnTargetContract(host, baseline, [nativeArray], false).kind, "rejected");
  assert.deepEqual(reconcileInferredReturnTargetContract(host,
    { ...csharpTargetNamedType("Fixture.Values", [float64], undefined, { allowsRefLikeTypeArguments: [false],}), csharpNullableReference: true },
    [csharpTargetNamedType("Fixture.Values", [int32], undefined, { allowsRefLikeTypeArguments: [false],})], false),
    { kind: "resolved", type: csharpNullableTargetType(csharpTargetNamedType("Fixture.Values", [int32], undefined, { allowsRefLikeTypeArguments: [false],})) });
  assert.equal(reconcileInferredReturnTargetContract(host,
    csharpNullableTargetType(csharpTargetNamedType("Other.Values", [float64], undefined, { allowsRefLikeTypeArguments: [false],})),
    [csharpTargetNamedType("Fixture.Values", [int32], undefined, { allowsRefLikeTypeArguments: [false],})], false).kind, "rejected");
});

test("inferred collection returns cover every physical numeric union arm without adding a checker carrier", () => {
  const native = csharpRuntimeUnionTargetType([int32, csharpSourcePrimitiveTargetType("uint32"), float64]);
  for (const [source, baseline] of [
    [{ kind: "array", element: native }, { kind: "array", element: float64 }],
    [{ kind: "tuple", elements: [native, string] }, { kind: "tuple", elements: [float64, string] }],
    [csharpTargetNamedType("Fixture.Values", [native], undefined, { allowsRefLikeTypeArguments: [false] }),
      csharpTargetNamedType("Fixture.Values", [float64], undefined, { allowsRefLikeTypeArguments: [false] })],
  ]) {
    const selected = reconcileInferredReturnTargetContract(host, baseline, [source], false);
    assert.equal(selected.kind === "resolved" && targetTypeRefEquals(selected.type, source), true,
      "all actual physical arms are preserved; no collection adapter or erased floating element is invented");
  }
  for (const [source, baseline] of [
    [{ kind: "array", element: csharpRuntimeUnionTargetType([int32, string]) }, { kind: "array", element: float64 }],
    [{ kind: "array", element: int32 }, { kind: "array", element: csharpRuntimeUnionTargetType([float64, string]) }],
    [{ kind: "array", element: int32 }, { kind: "array", element: csharpRuntimeUnionTargetType([float64, csharpAbsenceTargetType()]) }],
  ]) assert.equal(reconcileInferredReturnTargetContract(host, baseline, [source], false).kind, "rejected",
    "both directions retain every genuine nonnumeric or absent baseline arm");
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
