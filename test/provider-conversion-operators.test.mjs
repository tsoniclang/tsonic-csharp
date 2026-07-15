import assert from "node:assert/strict";
import test from "node:test";
import {
  pointerFactKey,
  targetConversionFactKey,
} from "@tsonic/tsts";

import {
  getCsharpProviderConversionOperatorById,
  requiresCsharpProviderConversionEvidence,
} from "../dist/source/csharp-source-semantics/provider-conversion-operators.js";
import {
  mapCsharpCheckedConversion,
} from "../dist/source/csharp-source-semantics/checked-native-mapping.js";
import {
  resolveCsharpCheckedConversionEvidence,
} from "../dist/source/csharp-source-semantics/checked-conversion-evidence.js";
import {
  enrichCsharpTargetTypeRef,
} from "../dist/source/csharp-source-semantics/target-enrichment.js";
import {
  csharpTargetConversionOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  substituteTargetTypeParameters,
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
  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }), context, hostForConversion([meterBinding], new Map([
    [source, doubleType],
    [target, meterType],
  ])));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_CHECKED_CONVERSION_UNSUPPORTED");
  assert.match(String(result.diagnostic.evidence[0].details), /exact TSTS-selected provider conversion operator identity/u);
  assert.equal(writes.some((write) => write.key === csharpTargetConversionOperationFactKey), false);
});

test("checked conversions accept unresolved function expressions for selected delegate targets", () => {
  const source = { id: "source-lambda", Kind: "KindArrowFunction" };
  const target = { id: "target-delegate" };
  const delegateType = csharpTargetNamedType("System.Func`2", [
    sourceDogType,
    doubleType,
  ], csharpQualifiedTypeRenderShape("System", "Func"), {
    delegateSignature: {
      parameters: [sourceDogType],
      returnType: doubleType,
    },
  });
  const { context, writes } = fakeContext();
  context.compiler = {
    ast: {
      is: {
        IsArrowFunction: (node) => node === source,
        IsFunctionExpression: () => false,
      },
    },
  };

  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }), context, hostForConversion([{
    id: delegateType.id,
    target: "csharp",
    kind: "delegate",
    sourceName: "Func",
    targetName: "System.Func",
  }], new Map([
    [target, delegateType],
  ])));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value.convertedType, delegateType);
  assert.equal(writes.some((write) => write.key === csharpTargetConversionOperationFactKey), false);
});

test("target enrichment preserves and substitutes selected use-site delegate evidence", () => {
  const inputType = { kind: "type-parameter", name: "TInput" };
  const resultType = { kind: "type-parameter", name: "TResult" };
  const openDelegate = csharpTargetNamedType(
    "System.Func`2",
    [inputType, resultType],
    csharpQualifiedTypeRenderShape("System", "Func"),
    {
      delegateSignature: {
        parameters: [inputType],
        returnType: resultType,
      },
    },
  );
  const closedDelegate = substituteTargetTypeParameters(openDelegate, new Map([
    ["TInput", sourceDogType],
    ["TResult", doubleType],
  ]));
  const metadataOnlyBinding = {
    id: "System.Func`2",
    target: "csharp",
    kind: "delegate",
    sourceName: "Func",
    targetName: "System.Func",
    csharpType: csharpTargetNamedType(
      "System.Func`2",
      [inputType, resultType],
      csharpQualifiedTypeRenderShape("System", "Func"),
    ),
    typeParameters: [{ name: "TInput" }, { name: "TResult" }],
  };

  const enriched = enrichCsharpTargetTypeRef(closedDelegate, {
    getCsharpTargetBindingByTargetId: (id) => id === metadataOnlyBinding.id ? metadataOnlyBinding : undefined,
    getCsharpTargetBindingByMetadataName: () => undefined,
  });

  assert.deepEqual(enriched?.csharpDelegateSignature, {
    parameters: [sourceDogType],
    returnType: doubleType,
  });
});

test("target substitution preserves provider-proven nullable reference modifiers on generic results", () => {
  const nullableResult = {
    kind: "type-parameter",
    name: "TResult",
    csharpNullableReference: true,
  };

  assert.deepEqual(
    substituteTargetTypeParameters(nullableResult, new Map([["TResult", sourceDogType]])),
    {
      ...sourceDogType,
      csharpNullableReference: true,
    },
  );
});

test("checked conversions accept same-shape delegate values without provider conversion metadata", () => {
  const source = { id: "source-handler" };
  const target = { id: "target-handler" };
  const httpContext = csharpTargetNamedType("Microsoft.AspNetCore.Http.HttpContext");
  const task = csharpTargetNamedType("System.Threading.Tasks.Task");
  const sourceDelegate = csharpTargetNamedType("System.Func`2", [
    httpContext,
    task,
  ], csharpQualifiedTypeRenderShape("System", "Func"), {
    delegateSignature: {
      parameters: [httpContext],
      returnType: task,
    },
  });
  const targetDelegate = csharpTargetNamedType("Microsoft.AspNetCore.Http.RequestDelegate", undefined, csharpQualifiedTypeRenderShape("Microsoft.AspNetCore.Http", "RequestDelegate"), {
    delegateSignature: {
      parameters: [httpContext],
      returnType: task,
    },
  });
  const { context, writes } = fakeContext();

  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }), context, hostForConversion([], new Map([
    [source, sourceDelegate],
    [target, targetDelegate],
  ])));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value.convertedType, targetDelegate);
  assert.equal(result.value.operation, undefined);
  assert.equal(writes.some((write) => write.key === csharpTargetConversionOperationFactKey), false);
});

test("checked provider conversions reject missing reflected conversion evidence", () => {
  const source = { id: "source-argument" };
  const target = { id: "target-parameter" };
  const { context, writes } = fakeContext();
  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }), context, hostForConversion([{ ...meterBinding, conversionOperators: [] }], new Map([
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
  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }), context, hostForConversion([{
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

test("checked conversions reuse existing conversion facts instead of conflicting with them", () => {
  const source = { id: "source-argument" };
  const target = { id: "target-parameter" };
  const intType = { kind: "source-primitive", name: "int32" };
  const existing = {
    convertedType: intType,
    operation: {
      operationId: "System.Convert.ToInt32",
      operationKind: "method",
      targetOperation: "ToInt32",
    },
  };
  const { context, writes, entries } = fakeContext();
  entries.set(factEntryKey(source, targetConversionFactKey), existing);

  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }), context, hostForConversion([], new Map([
    [source, intType],
    [target, intType],
  ])));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value, existing);
  assert.equal(writes.length, 0);
});

test("checked conversions reject real double generic targets without selected conversion identity", () => {
  const source = { id: "source-span" };
  const target = { id: "target-span" };
  const sourceType = spanType({ kind: "source-primitive", name: "int32" });
  const targetType = spanType({ kind: "source-primitive", name: "float64" });
  const { context, writes } = fakeContext();

  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }), context, hostForConversion([spanBinding()], new Map([
    [source, sourceType],
    [target, targetType],
  ])));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_CHECKED_CONVERSION_UNSUPPORTED");
  assert.equal(writes.some((write) => write.key === csharpTargetConversionOperationFactKey), false);
});

test("checked conversions accept source primitive widening only through explicit conversion facts", () => {
  const source = { id: "source-int" };
  const target = { id: "target-double" };
  const intType = { kind: "source-primitive", name: "int32" };
  const { context, writes } = fakeContext();

  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target,
    targetPlatform: "csharp",
  }), context, hostForConversion([], new Map([
    [source, intType],
    [target, doubleType],
  ])));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value.convertedType, doubleType);
  assert.equal(result.value.operation.operationId, "System.Convert.ToDouble");
  assert.equal(writes.some((write) => write.key === csharpTargetConversionOperationFactKey), true);
});

test("checked params-array argument conversions use the selected parameter element type", () => {
  const source = { id: "source-console-argument" };
  const paramsArrayType = { kind: "array", element: meterType };
  const targetParameter = {
    name: "values",
    type: paramsArrayType,
    passingMode: "by-value",
    paramsArray: true,
  };
  const { context } = fakeContext();

  const result = mapCsharpCheckedConversion(callArgumentConversionRequest({
    expression: source,
    source,
    target: paramsArrayType,
    targetParameter,
    parameterIndex: 0,
    targetPlatform: "csharp",
  }), context, hostForConversion([], new Map([
    [source, meterType],
    [paramsArrayType, paramsArrayType],
    [meterType, meterType],
  ])));

  assert.equal(result.kind, "accept");
  assert.deepEqual(result.value.convertedType, meterType);
});

test("assertion declaration provenance cannot override an incompatible flow-selected semantic type", () => {
  const expression = { id: "assertion", Kind: "KindAsExpression" };
  const sourceExpression = { id: "source-expression", Kind: "KindIdentifier" };
  const sourceSemanticType = { flags: 1 };
  const targetSemanticType = { flags: 2 };
  const declarationType = { id: "source-declaration-type", Kind: "KindTypeReference" };
  const explicitTargetType = { id: "explicit-target-type", Kind: "KindStringKeyword" };
  const intType = { kind: "source-primitive", name: "int32" };
  const stringType = csharpTargetNamedType("System.String");
  const { context, entries } = fakeContext();
  entries.set(factEntryKey(declarationType, pointerFactKey), {
    pointee: intType,
    mutability: "target-defined",
    unsafeRequired: true,
  });

  const result = resolveCsharpCheckedConversionEvidence({
    conversionKind: "assertion",
    assertionKind: "as",
    expression,
    source: sourceSemanticType,
    target: targetSemanticType,
    sourceExpression,
    sourceSelectedDeclarationTypeNode: declarationType,
    explicitTargetTypeNode: explicitTargetType,
    targetPlatform: "csharp",
  }, context, hostForConversion([], new Map([
    [sourceSemanticType, stringType],
    [targetSemanticType, stringType],
    [intType, intType],
  ])));

  assert.equal(result.kind, "unreconciled");
  assert.equal(result.side, "source");
  assert.deepEqual(result.semantic, stringType);
  assert.deepEqual(result.authored, {
    kind: "pointer",
    pointee: intType,
    mutability: "target-defined",
  });
  assert.match(result.reason, /conflicts with the checker-selected semantic target type/u);
});

function callArgumentConversionRequest(options) {
  const targetParameter = options.targetParameter ?? {
    name: "value",
    type: options.target,
    passingMode: "by-value",
  };
  const call = { id: "checked-conversion-call" };
  return {
    conversionKind: "call-argument",
    expression: options.expression,
    source: options.source,
    target: options.target,
    targetPlatform: options.targetPlatform,
    call,
    parameterIndex: options.parameterIndex ?? 0,
    targetParameter,
    selectedSignature: {
      member: {
        id: "test.checked-conversion",
        kind: "method",
        sourceName: "convert",
        targetName: "Convert",
        static: true,
        parameters: [targetParameter],
        returnType: targetParameter.type,
      },
    },
  };
}

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
    entries,
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
      factResolver: {
        resolve: (subject, key) => entries.get(factEntryKey(subject, key)),
      },
    },
  };
}

function spanType(element) {
  return {
    kind: "target-named",
    id: "System.Span`1",
    typeArguments: [element],
  };
}

function spanBinding() {
  return {
    id: "System.Span`1",
    target: "csharp",
    kind: "struct",
    sourceName: "Span",
    targetName: "System.Span",
  };
}

function factEntryKey(subject, key) {
  return `${subject.id ?? "subject"}:${key.id}`;
}
