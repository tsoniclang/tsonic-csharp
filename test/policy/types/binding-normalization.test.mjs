import assert from "node:assert/strict";
import test from "node:test";
import { csharpBindingDefaultCarrier } from "../../../dist/policy/types/binding-normalization.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";

test("binding defaults preserve nullable fallback storage and native generic payloads", () => {
  for (const value of [csharpSourcePrimitiveTargetType("int64"), csharpStringTargetType(),
    { kind: "type-parameter", name: "Value", identity: "source:Value" }]) {
    const nullable = csharpNullableTargetType(value);
    assert.deepEqual(csharpBindingDefaultCarrier(nullable, value), value);
    assert.deepEqual(csharpBindingDefaultCarrier(nullable, nullable), nullable);
    assert.deepEqual(csharpBindingDefaultCarrier(value, nullable), nullable);
  }
});
