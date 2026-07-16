import { test, assert, argumentPassingFactKey, attributeFactKey, defaultValueFactKey, deferObservation, fieldFactKey, flowStateFactKey, functionPointerFactKey, pointerFactKey, providerVirtualDeclarationFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetBindingFactKey, csharpTargetOperationFactKey, createCsharpNativeOperationsProvider, selectTargetMember, validateCsharpTargetConstraintFactsBeforeFinalization, csharpNullableValueTargetType, csharpSourcePrimitiveDotnetMetadataName, resolveTargetTypeRefFromSubjectFacts, getNativeSemanticProvider, method, property, field, eventMember, constructorMember, targetParameterWithOptions, unsupportedMember, assertUnsupportedDiagnosticEvidence, indexer, csharpStringType, csharpObjectType, csharpVoidType, csharpReadOnlySpanType, csharpIEnumerableType, overlapExtensionsBinding, overlapMethod, targetParameter, spanType, readOnlySpanType, coreLangMarker, virtualMember, propertyAccessCallee, targetIdFromMemberId, fakeObservationContext } from "./provider-selection.helpers.mjs";

test("C# provider rejects exact selected generic signatures with contradictory target facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const string = csharpStringType();
  const genericMember = {
    id: "Example.Target.pair``1(T,T)",
    sourceName: "pair",
    targetName: "Pair",
    kind: "method",
    typeParameters: [{ name: "T" }],
    parameters: [
      {
        name: "left",
        type: { kind: "type-parameter", name: "T" },
        passingMode: "by-value",
      },
      {
        name: "right",
        type: { kind: "type-parameter", name: "T" },
        passingMode: "by-value",
      },
    ],
    returnType: { kind: "type-parameter", name: "T" },
    overloadGroup: "Example.Target.pair",
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "pair",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [int32, string],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: {
      id: "Example.Target",
      sourceName: "Target",
      targetName: "Target",
      target: "csharp",
      kind: "class",
      members: [genericMember],
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.pair", "pair"),
      signatureId: genericMember.id,
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});
test("C# provider resolves overloaded member selections from provider member identity and target facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int64",
      runtimeBase: "number",
      signed: true,
      width: 64,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});
test("C# provider preserves exact selected call signatures instead of refining to siblings", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      { ...method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }), sourceName: "renamed" },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});
test("C# provider selects within a proven overload group from target argument facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});
test("C# provider maps calls from TSTS-selected callee symbol virtual declaration facts", () => {
  const provider = getNativeSemanticProvider();
  const calleeSymbol = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    sourceCalleeSymbol: calleeSymbol,
    calleePropertyName: "m",
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: calleeSymbol,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});
test("C# provider rejects exact selected signatures when target facts contradict the TS-selected signature", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const recordedFacts = [];
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Byte)", { kind: "source-primitive", name: "uint8" }),
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Byte)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider selects within provider source-projection signature groups using target facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = csharpStringType();
  const sourceProjectionSignatureId = "Example.Target.m#source-signature:string";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Char)", { kind: "source-primitive", name: "char" }, { providerSourceSignatureId: sourceProjectionSignatureId }),
      method("Example.Target.m(System.String)", csharpStringType(), { providerSourceSignatureId: sourceProjectionSignatureId }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: sourceProjectionSignatureId,
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : result.kind);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.String)");
});
test("C# provider does not refine selected signatures outside the proven overload group", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Byte)", { kind: "source-primitive", name: "uint8" }),
      method("Example.Target.other(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "m", overloadGroup: "Example.Target.other" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Byte)",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});
test("C# provider accepts literal arguments for exact selected target signatures", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const literalArgument = { Kind: 1, Text: "0" };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [literalArgument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Int32)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});
test("C# provider accepts representable literals for exact nullable target parameters", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const literalArgument = { Kind: 1, Text: "1" };
  const nullableInt32 = csharpNullableValueTargetType({ kind: "source-primitive", name: "int32" });
  const signatureId = "Example.Target.m(System.Nullable<System.Int32>)";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [method(signatureId, nullableInt32)],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [literalArgument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId,
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, signatureId);
});
test("C# provider does not search target members outside the selected provider overload group", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      { ...method("Example.Target.other(System.Int32)", { kind: "source-primitive", name: "int32" }), sourceName: "m", overloadGroup: "Example.Target.other" },
      { ...method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }), sourceName: "renamed", overloadGroup: "Example.Target.m" },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      artifactFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});
test("C# provider rejects same-spelling call members without selected provider identity membership", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.other(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "m", overloadGroup: "Example.Target.other" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.m", "renamed"),
      signatureId: "Example.Target.m(System.Int32)",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});
test("C# provider rejects provider-owned receiver calls without selected member identity", () => {
  const receiverType = {
    kind: "target-named",
    id: "Example.Exception",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Exception" },
  };
  const receiver = { Kind: "KindIdentifier", Text: "exception", ...receiverType };
  const binding = {
    id: "Example.Exception",
    sourceName: "Exception",
    targetName: "Exception",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Exception" },
    members: [
      {
        id: "Example.Exception.ToString()",
        sourceName: "toString",
        targetName: "ToString",
        kind: "method",
        parameters: [],
        returnType: csharpStringType(),
        overloadGroup: "Example.Exception.ToString",
        declaringType: receiverType,
      },
    ],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: propertyAccessCallee(receiver, "toString"),
    sourceCalleeSymbol: receiverType,
    arguments: [],
  }, fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
  assert.equal(
    result.diagnostic.message,
    "C# provider could not map checked call 'toString' on target 'Example.Exception'.",
  );
});
test("C# provider maps property access from selected provider member identity instead of property text", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const expression = {};
  const receiver = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      property("Example.Target.unrelated", "m", "Unrelated"),
      property("Example.Target.actual", "renamed", "Actual"),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver,
    sourceSelectedSymbol: selectedDeclaration,
    propertyName: "m",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.actual", "renamed"),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Example.Target.actual");
});
test("C# provider maps field access from selected provider member identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const expression = {};
  const receiver = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      field("Example.Target.ActualField", "renamed", "ActualField"),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver,
    sourceSelectedSymbol: selectedDeclaration,
    propertyName: "m",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.ActualField", "renamed"),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Example.Target.ActualField");
  assert.equal(result.value.operation.operationKind, "property");
});
