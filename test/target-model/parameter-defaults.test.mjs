import assert from "node:assert/strict";
import test from "node:test";
import { csharpRuntimeParameterDefault } from "../../dist/target-model/types/parameter-defaults.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType,
  csharpTsValueTargetType, csharpTargetNamedType, csharpVoidTargetType } from "../../dist/target-model/types/index.js";

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
  for (const type of [csharpVoidTargetType(), csharpNullableTargetType(reference),
    { kind: "type-parameter", name: "T", identity: "default-test-T" },
    csharpTargetNamedType("opaque.absence", undefined, { kind: "predefined", name: "object" }, { absorbsNullish: true })]) {
    assert.equal(csharpRuntimeParameterDefault(type), undefined);
  }
  assert.ok(Object.isFrozen(closedDefault));
});

test("contextual default parameters retain one exact nullable input and present value carrier", () => {
  for (const value of [csharpSourcePrimitiveTargetType("int32"), csharpSourcePrimitiveTargetType("int64"), csharpStringTargetType()]) {
    const incoming = csharpNullableTargetType(value);
    const selected = csharpRuntimeParameterDefault(value, incoming);
    assert.deepEqual(selected, { kind: "nullable", valueType: value, parameterType: incoming });
    assert.equal(selected.parameterType, incoming);
    assert.ok(Object.isFrozen(selected));
    assert.equal(csharpRuntimeParameterDefault(value, value), undefined);
    assert.equal(csharpRuntimeParameterDefault(incoming, incoming), undefined);
  }
  assert.equal(csharpRuntimeParameterDefault(csharpSourcePrimitiveTargetType("int32"),
    csharpNullableTargetType(csharpSourcePrimitiveTargetType("int64"))), undefined);
});
