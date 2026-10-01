import assert from "node:assert/strict";
import test from "node:test";
import { csharpRuntimeParameterDefault } from "../../dist/target-model/types/parameter-defaults.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType,
  csharpTsValueTargetType, csharpTargetNamedType } from "../../dist/target-model/types/index.js";

test("native defaults select one explicit incoming absence ABI without wrapping closed values", () => {
  const closed = csharpTsValueTargetType();
  const closedDefault = csharpRuntimeParameterDefault(closed);
  assert.deepEqual(closedDefault, { kind: "closed-value", valueType: closed, parameterType: closed });
  assert.equal(closedDefault.parameterType, closed);
  const reference = csharpStringTargetType();
  assert.deepEqual(csharpRuntimeParameterDefault(reference), {
    kind: "nullable", valueType: reference, parameterType: csharpNullableTargetType(reference),
  });
  for (const type of [csharpSourcePrimitiveTargetType("float64"), csharpNullableTargetType(reference),
    { kind: "type-parameter", name: "T", identity: "default-test-T" },
    csharpTargetNamedType("opaque.absence", undefined, { kind: "predefined", name: "object" }, { absorbsNullish: true })]) {
    assert.equal(csharpRuntimeParameterDefault(type), undefined);
  }
  assert.ok(Object.isFrozen(closedDefault));
});
