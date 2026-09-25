import assert from "node:assert/strict";
import test from "node:test";
import { validateBinaryTargetSemantics } from "../../../dist/policy/operations/operators/operator-validation.js";
import { csharpNullableTargetType, csharpTargetNamedType } from "../../../dist/target-model/types/index.js";

const context = {
  providers: { findTargetBindingByTargetId: () => undefined },
  projectTypes: { catalog: { definitionForTarget: () => undefined } },
};

test("nullable scalar equality admits a present operand in either order", () => {
  const scalar = { kind: "source-primitive", name: "float64" };
  const nullable = csharpNullableTargetType(scalar);
  for (const operator of ["===", "!=="]) {
    assert.equal(validateBinaryTargetSemantics(operator, nullable, scalar, context), undefined);
    assert.equal(validateBinaryTargetSemantics(operator, scalar, nullable, context), undefined);
  }
});

test("nullable equality does not infer equality of two absent or unproved provider carriers", () => {
  const nullable = csharpNullableTargetType({ kind: "source-primitive", name: "float64" });
  assert.match(validateBinaryTargetSemantics("===", nullable, nullable, context), /not proven equivalent/);
  const provider = csharpTargetNamedType("External.Value", [], { kind: "named", namespace: ["External"], name: "Value" }, { valueType: true });
  const owned = { ...context, providers: { findTargetBindingByTargetId: () => ({ kind: "struct" }) } };
  assert.match(validateBinaryTargetSemantics("===", csharpNullableTargetType(provider), provider, owned), /provider operator relation/);
});
