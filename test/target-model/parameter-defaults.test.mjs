import assert from "node:assert/strict";
import test from "node:test";
import { csharpRuntimeParameterDefault } from "../../dist/policy/types/storage/parameter-defaults.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType,
  csharpTsValueTargetType, csharpTargetNamedType, csharpVoidTargetType } from "../../dist/target-model/types/index.js";
import { targetTypeRefEquals } from "../../dist/target-model/types/equality.js";

test("native defaults select one explicit incoming absence ABI without wrapping closed values", () => {
  const closed = csharpTsValueTargetType();
  const closedDefault = csharpRuntimeParameterDefault(closed);
  assert.deepEqual(closedDefault, { kind: "closed-value", valueType: closed, parameterType: closed });
  assert.equal(closedDefault.parameterType, closed);
  const reference = csharpStringTargetType();
  assert.deepEqual(csharpRuntimeParameterDefault(reference), {
    kind: "nullable", valueType: reference, parameterType: csharpNullableTargetType(reference),
  });
  for (const name of ["float64", "int32", "int64", "uint64", "bool"]) {
    const value = csharpSourcePrimitiveTargetType(name);
    const selected = csharpRuntimeParameterDefault(value);
    assert.deepEqual(selected, {
      kind: "nullable", valueType: value, parameterType: csharpNullableTargetType(value),
    });
    assert.ok(Object.isFrozen(selected));
    assert.equal(csharpRuntimeParameterDefault(value, value), undefined);
  }
  for (const type of [csharpVoidTargetType(),
    { kind: "type-parameter", name: "T", identity: "default-test-T" },
    csharpTargetNamedType("opaque.absence", undefined, { kind: "predefined", name: "object" }, { allowsRefLikeTypeArguments: [], absorbsNullish: true })]) {
    assert.equal(csharpRuntimeParameterDefault(type), undefined);
  }
  assert.ok(Object.isFrozen(closedDefault));
});

test("contextual default parameters retain one exact nullable input and present value carrier", () => {
  const tuple = { kind: "tuple", elements: [csharpSourcePrimitiveTargetType("int32")] };
  const tupleDefault = csharpRuntimeParameterDefault(tuple);
  assert.deepEqual(tupleDefault, { kind: "nullable", valueType: tuple, parameterType: csharpNullableTargetType(tuple) });
  assert.equal(tupleDefault.valueType === tuple, true);
  const optionalTuple = csharpNullableTargetType(tuple);
  assert.deepEqual(csharpRuntimeParameterDefault(optionalTuple), {
    kind: "nullable", valueType: optionalTuple, parameterType: optionalTuple,
  });
  assert.equal(csharpRuntimeParameterDefault(tuple,
    csharpNullableTargetType({ kind: "tuple", elements: [csharpSourcePrimitiveTargetType("int64")] })), undefined);
  for (const value of [csharpSourcePrimitiveTargetType("int32"), csharpSourcePrimitiveTargetType("int64"), csharpStringTargetType(), tuple]) {
    const incoming = csharpNullableTargetType(value);
    const selected = csharpRuntimeParameterDefault(value, incoming);
    assert.deepEqual(selected, { kind: "nullable", valueType: value, parameterType: incoming });
    assert.equal(selected.parameterType, incoming);
    assert.ok(Object.isFrozen(selected));
    assert.equal(csharpRuntimeParameterDefault(value, value), undefined);
    const retained = csharpRuntimeParameterDefault(incoming, incoming);
    assert.deepEqual(retained, { kind: "nullable", valueType: incoming, parameterType: incoming });
    assert.equal(retained.valueType === incoming, true);
    assert.equal(retained.parameterType === incoming, true);
    assert.equal(Object.isFrozen(retained), true);
  }
  assert.equal(csharpRuntimeParameterDefault(csharpSourcePrimitiveTargetType("int32"),
    csharpNullableTargetType(csharpSourcePrimitiveTargetType("int64"))), undefined);
  assert.equal(csharpRuntimeParameterDefault(csharpNullableTargetType(csharpSourcePrimitiveTargetType("int32")),
    csharpNullableTargetType(csharpSourcePrimitiveTargetType("int64"))), undefined);
});

test("native generic omission defaults use the actual closed projection rather than a null literal", () => {
  const value = { kind: "type-parameter", name: "Value", identity: "native-default-value",
    csharpConstraints: { kind: "resolved", constraints: [] } };
  const incoming = csharpNullableTargetType(value);
  const selected = csharpRuntimeParameterDefault(value);
  assert.equal(selected?.kind, "closed-value", "an open optional-storage parameter cannot use a null default");
  assert.equal(selected.valueType === value, true, "the callee still receives its actual present binder");
  assert.equal(targetTypeRefEquals(selected.parameterType, incoming), true, "the existing native optional ABI is retained");
  const contextual = csharpRuntimeParameterDefault(value, incoming);
  assert.equal(contextual?.kind, "closed-value", "contextual admission uses the same physical omission form");
  assert.equal(contextual.parameterType === incoming, true, "the exact selected native input is retained");
  const optional = csharpRuntimeParameterDefault(incoming);
  assert.equal(optional?.kind, "closed-value", "an already optional generic projection is not lifted again");
  assert.equal(optional.valueType === incoming && optional.parameterType === incoming, true, "native optional storage identity remains exact");
  assert.equal(csharpRuntimeParameterDefault(value, value) === undefined, true, "a plain generic value is not a missing-value representation");
  const other = { ...value, identity: "other-default-value" };
  assert.equal(csharpRuntimeParameterDefault(value, csharpNullableTargetType(other)) === undefined, true,
    "unrelated native generic inputs remain refused");
  const reference = { ...value, identity: "native-reference-default",
    csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  const referenceDefault = csharpRuntimeParameterDefault(reference);
  assert.equal(referenceDefault?.kind, "nullable", "an actual class constraint retains the real native nullable-reference form");
});
