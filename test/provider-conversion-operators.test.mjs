import assert from "node:assert/strict";
import test from "node:test";

import {
  getCsharpProviderConversionOperator,
  requiresCsharpProviderConversionEvidence,
} from "../dist/source/csharp-source-semantics/provider-conversion-operators.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../dist/source/csharp-source-semantics/target-types.js";

const doubleType = { kind: "source-primitive", name: "float64" };
const meterType = csharpTargetNamedType("ProviderConversionFixtures.Meter", undefined, csharpQualifiedTypeRenderShape("ProviderConversionFixtures", "Meter"), {
  valueType: true,
});
const sourceDogType = csharpTargetNamedType("Dog", undefined, { kind: "named", name: "Dog" }, {
  sourceDeclarationKind: "class",
});
const meterBinding = {
  id: "ProviderConversionFixtures.Meter",
  target: "csharp",
  kind: "struct",
  sourceName: "Meter",
  targetName: "ProviderConversionFixtures.Meter",
  csharpType: meterType,
  conversionOperators: [
    {
      id: "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
      conversionKind: "explicit",
      declaringType: meterType,
      sourceType: doubleType,
      targetType: meterType,
    },
    {
      id: "ProviderConversionFixtures.Meter.op_Implicit(ProviderConversionFixtures.Meter)",
      conversionKind: "implicit",
      declaringType: meterType,
      sourceType: meterType,
      targetType: doubleType,
    },
  ],
};

test("provider conversion operator selection requires reflected operator identity", () => {
  const host = hostForBindings([meterBinding]);

  const explicitResult = getCsharpProviderConversionOperator(doubleType, meterType, host, "explicit-or-implicit");
  assert.equal(explicitResult.kind, "matched");
  assert.equal(explicitResult.operation.operationId, "ProviderConversionFixtures.Meter.op_Explicit(System.Double)");
  assert.equal(explicitResult.csharpOperation.kind, "conversion-operator");
  assert.deepEqual(explicitResult.csharpOperation.targetType, meterType);

  const implicitOnly = getCsharpProviderConversionOperator(doubleType, meterType, host, "implicit-only");
  assert.equal(implicitOnly.kind, "none");

  const implicitResult = getCsharpProviderConversionOperator(meterType, doubleType, host, "implicit-only");
  assert.equal(implicitResult.kind, "matched");
  assert.equal(implicitResult.operation.operationId, "ProviderConversionFixtures.Meter.op_Implicit(ProviderConversionFixtures.Meter)");
});

test("provider conversion evidence is required only for provider-owned target types", () => {
  const host = hostForBindings([meterBinding]);

  assert.equal(requiresCsharpProviderConversionEvidence(doubleType, meterType, host), true);
  assert.equal(requiresCsharpProviderConversionEvidence(doubleType, sourceDogType, host), false);
  assert.equal(requiresCsharpProviderConversionEvidence(meterType, meterType, host), false);
});

test("provider conversion operator selection reports ambiguity instead of choosing by order", () => {
  const duplicateBinding = {
    ...meterBinding,
    conversionOperators: [
      ...meterBinding.conversionOperators,
      {
        ...meterBinding.conversionOperators[0],
        id: "ProviderConversionFixtures.Meter.op_Explicit(System.Double)#duplicate",
      },
    ],
  };
  const host = hostForBindings([duplicateBinding]);

  const result = getCsharpProviderConversionOperator(doubleType, meterType, host, "explicit-or-implicit");
  assert.equal(result.kind, "ambiguous");
  assert.deepEqual(result.candidateIds, [
    "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
    "ProviderConversionFixtures.Meter.op_Explicit(System.Double)#duplicate",
  ]);
});

function hostForBindings(bindings) {
  const byId = new Map(bindings.map((binding) => [binding.id, binding]));
  return {
    getCsharpTargetBindingByTargetId: (targetId) => byId.get(targetId),
  };
}
