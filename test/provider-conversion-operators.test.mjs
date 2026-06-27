import assert from "node:assert/strict";
import test from "node:test";

import {
  getCsharpProviderConversionOperatorById,
  requiresCsharpProviderConversionEvidence,
} from "../dist/source/csharp-source-semantics/provider-conversion-operators.js";
import {
  mapCsharpCheckedConversion,
} from "../dist/source/csharp-source-semantics/checked-native-mapping.js";
import {
  csharpTargetConversionOperationFactKey,
} from "../dist/source/csharp-facts.js";
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

test("provider conversion operator selection requires exact selected operator identity", () => {
  const host = hostForBindings([meterBinding]);

  const explicitResult = getCsharpProviderConversionOperatorById(
    "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
    doubleType,
    meterType,
    host,
    "explicit-or-implicit",
  );
  assert.equal(explicitResult.kind, "matched");
  assert.equal(explicitResult.operation.operationId, "ProviderConversionFixtures.Meter.op_Explicit(System.Double)");
  assert.equal(explicitResult.csharpOperation.kind, "conversion-operator");
  assert.deepEqual(explicitResult.csharpOperation.targetType, meterType);

  const implicitOnly = getCsharpProviderConversionOperatorById(
    "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
    doubleType,
    meterType,
    host,
    "implicit-only",
  );
  assert.equal(implicitOnly.kind, "none");

  const implicitResult = getCsharpProviderConversionOperatorById(
    "ProviderConversionFixtures.Meter.op_Implicit(ProviderConversionFixtures.Meter)",
    meterType,
    doubleType,
    host,
    "implicit-only",
  );
  assert.equal(implicitResult.kind, "matched");
  assert.equal(implicitResult.operation.operationId, "ProviderConversionFixtures.Meter.op_Implicit(ProviderConversionFixtures.Meter)");
});

test("provider conversion operator selection does not match metadata-name-only evidence", () => {
  const metadataOnlyBinding = {
    ...meterBinding,
    conversionOperators: [{
      ...meterBinding.conversionOperators[0],
      id: "ProviderConversionFixtures.Meter.MetadataOnlyShadow",
      metadataName: "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
    }],
  };
  const result = getCsharpProviderConversionOperatorById(
    "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
    doubleType,
    meterType,
    hostForBindings([metadataOnlyBinding]),
    "explicit-or-implicit",
  );

  assert.equal(result.kind, "none");
});

test("provider conversion evidence is required only for provider-owned target types", () => {
  const host = hostForBindings([meterBinding]);

  assert.equal(requiresCsharpProviderConversionEvidence(doubleType, meterType, host), true);
  assert.equal(requiresCsharpProviderConversionEvidence(doubleType, sourceDogType, host), false);
  assert.equal(requiresCsharpProviderConversionEvidence(meterType, meterType, host), false);
});

test("provider conversion operator selection reports exact-id ambiguity instead of choosing by order", () => {
  const duplicateBinding = {
    ...meterBinding,
    conversionOperators: [
      ...meterBinding.conversionOperators,
      {
        ...meterBinding.conversionOperators[0],
      },
    ],
  };
  const host = hostForBindings([duplicateBinding]);

  const result = getCsharpProviderConversionOperatorById(
    "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
    doubleType,
    meterType,
    host,
    "explicit-or-implicit",
  );
  assert.equal(result.kind, "ambiguous");
  assert.deepEqual(result.candidateIds, [
    "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
    "ProviderConversionFixtures.Meter.op_Explicit(System.Double)",
  ]);
});

test("checked provider conversions fail closed without selected provider conversion identity", () => {
  const source = { id: "source-argument" };
  const target = { id: "target-parameter" };
  const { context, writes } = fakeContext();
  const result = mapCsharpCheckedConversion({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }, context, hostForConversion([meterBinding], new Map([
    [source, doubleType],
    [target, meterType],
  ])));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_CHECKED_CONVERSION_UNSUPPORTED");
  assert.match(String(result.diagnostic.evidence[0].details), /exact TSTS-selected provider conversion operator identity/u);
  assert.equal(writes.some((write) => write.key === csharpTargetConversionOperationFactKey), false);
});

test("checked provider conversions reject missing reflected conversion evidence", () => {
  const source = { id: "source-argument" };
  const target = { id: "target-parameter" };
  const { context, writes } = fakeContext();
  const result = mapCsharpCheckedConversion({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }, context, hostForConversion([{ ...meterBinding, conversionOperators: [] }], new Map([
    [source, doubleType],
    [target, meterType],
  ])));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_CHECKED_CONVERSION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /requires a finalized provider conversion operator fact/u);
  assert.equal(writes.some((write) => write.key === csharpTargetConversionOperationFactKey), false);
});

test("checked provider conversions do not inspect ambiguous type-pair candidates without selected identity", () => {
  const source = { id: "source-argument" };
  const target = { id: "target-parameter" };
  const { context, writes } = fakeContext();
  const result = mapCsharpCheckedConversion({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }, context, hostForConversion([{
    ...meterBinding,
    conversionOperators: [
      ...meterBinding.conversionOperators,
      {
        ...meterBinding.conversionOperators[0],
        id: "ProviderConversionFixtures.Meter.op_Explicit(System.Double)#duplicate",
      },
    ],
  }], new Map([
    [source, doubleType],
    [target, meterType],
  ])));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_CHECKED_CONVERSION_UNSUPPORTED");
  assert.doesNotMatch(JSON.stringify(result.diagnostic.evidence), /#duplicate/u);
  assert.equal(writes.some((write) => write.key === csharpTargetConversionOperationFactKey), false);
});

function hostForBindings(bindings) {
  const byId = new Map(bindings.map((binding) => [binding.id, binding]));
  return {
    getCsharpTargetBindingByTargetId: (targetId) => byId.get(targetId),
  };
}

function hostForConversion(bindings, targetTypes) {
  return {
    ...hostForBindings(bindings),
    getTargetTypeRefForSubject: (subject) => targetTypes.get(subject),
  };
}

function fakeContext() {
  const writes = [];
  const entries = new Map();
  return {
    writes,
    context: {
      extensionId: "tsonic.csharp.operations",
      facts: {
        get: (subject, key) => entries.get(factEntryKey(subject, key)),
        set: (subject, key, value, evidence = []) => {
          writes.push({ subject, key, value, evidence });
          entries.set(factEntryKey(subject, key), value);
          return "inserted";
        },
      },
    },
  };
}

function factEntryKey(subject, key) {
  return `${subject.id ?? "subject"}:${key.id}`;
}
