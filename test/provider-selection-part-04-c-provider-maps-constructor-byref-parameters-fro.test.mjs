import { test, assert, argumentPassingFactKey, attributeFactKey, defaultValueFactKey, deferObservation, fieldFactKey, flowStateFactKey, functionPointerFactKey, pointerFactKey, providerVirtualDeclarationFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetBindingFactKey, csharpTargetOperationFactKey, createCsharpNativeOperationsProvider, selectTargetMember, csharpNullableValueTargetType, csharpSourcePrimitiveDotnetMetadataName, resolveTargetTypeRefFromSubjectFacts, checkedCallRequest, getNativeSemanticProvider, method, property, field, eventMember, constructorMember, targetParameterWithOptions, unsupportedMember, assertUnsupportedDiagnosticEvidence, indexer, csharpStringType, csharpObjectType, csharpVoidType, csharpReadOnlySpanType, csharpIEnumerableType, overlapExtensionsBinding, overlapMethod, targetParameter, spanType, readOnlySpanType, coreLangMarker, virtualMember, propertyAccessCallee, targetIdFromMemberId, fakeObservationContext } from "./provider-selection.helpers.mjs";

test("C# provider maps constructor byref parameters from source marker target expressions", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const outCall = {};
  const value = {};
  const targetType = {
    kind: "target-named",
    id: "Example.Target",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
  };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [
      {
        ...constructorMember("Example.Target..ctor(out System.Int32)", { kind: "source-primitive", name: "int32" }),
        parameters: [
          targetParameter("value", { kind: "source-primitive", name: "int32" }, "byref-writeonly-must-init"),
        ],
      },
    ],
  };

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: { Kind: "KindNewExpression" },
    callee: {},
    callKind: "construct",
    selectedDeclaration: selectedDeclaration,
    sourceResultType: targetType,
    arguments: [outCall],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      storageExpression: value,
    },
    sourcePrimitiveSubject: value,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target..ctor", "constructor"),
      signatureId: "Example.Target..ctor(out System.Int32)",
      targetIdentity: targetType,
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target..ctor(out System.Int32)");
});
test("C# provider closes ref out and in parameter modes from selected provider metadata", () => {
  const selectedSignature = {};
  const containerSymbol = {};
  const call = {};
  const refCall = {};
  const outCall = {};
  const inCall = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const bool = { kind: "source-primitive", name: "bool" };
  const int64 = { kind: "source-primitive", name: "int64" };
  const refParameter = targetParameter("current", int32, "byref-readwrite");
  const outParameter = targetParameter("assigned", bool, "byref-writeonly-must-init");
  const inParameter = targetParameter("snapshot", int64, "byref-readonly");
  const selectedProviderDeclaration = {
    ...virtualMember("Example.Target.update", "update"),
    signatureId: "Example.Target.update(ref System.Int32,out System.Boolean,in System.Int64)",
  };
  const member = {
    id: selectedProviderDeclaration.signatureId,
    sourceName: "update",
    targetName: "Update",
    kind: "method",
    parameters: [refParameter, outParameter, inParameter],
    returnType: { kind: "source-primitive", name: "bool" },
    overloadGroup: "Example.Target.update",
  };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [member],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });
  const recordedFacts = [];

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: {},
    selectedSignature: selectedSignature,
    arguments: [refCall, outCall, inCall],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualSignatureSubject: selectedSignature,
    virtualSignatureDeclaration: selectedProviderDeclaration,
    argumentPassingBySubject: new Map([
      [refCall, {
        mode: "byref-readwrite",
        storageExpression: int32,
      }],
      [outCall, {
        mode: "byref-writeonly-must-init",
        storageExpression: bool,
      }],
      [inCall, {
        mode: "byref-readonly",
        storageExpression: int64,
      }],
    ]),
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.providerDeclaration.signatureId, selectedProviderDeclaration.signatureId);
  assert.deepEqual(result.value.selectedSignature.member.parameters.map((parameter) => parameter.passingMode), [
    "byref-readwrite",
    "byref-writeonly-must-init",
    "byref-readonly",
  ]);
  assert.deepEqual(result.value.argumentConversions, [0, 1, 2].map((index) => ({
    sourceArgumentIndex: index,
    sourceForm: "value",
    targetParameterIndex: index,
    targetForm: "parameter",
  })));
  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.deepEqual(operation?.selectedMember?.parameters.map((parameter) => parameter.passingMode), [
    "byref-readwrite",
    "byref-writeonly-must-init",
    "byref-readonly",
  ]);
});
test("C# provider does not refine exact selected constructor signatures from byref argument facts", () => {
  const selectedSignature = {};
  const containerSymbol = {};
  const call = {};
  const refCall = {};
  const value = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const int64 = { kind: "source-primitive", name: "int64" };
  const targetType = {
    kind: "target-named",
    id: "Example.Target",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
  };
  const byValueDeclaration = {
    ...virtualMember("Example.Target..ctor", "constructor"),
    signatureId: "Example.Target..ctor(System.Int32,System.String)",
    targetIdentity: targetType,
  };
  const byValueMember = {
    id: byValueDeclaration.signatureId,
    sourceName: "constructor",
    targetName: ".ctor",
    kind: "constructor",
    declaringType: targetType,
    parameters: [
      targetParameter("value", int32),
      targetParameterWithOptions("label", csharpStringType(), { optional: true }),
    ],
    overloadGroup: "Example.Target..ctor",
  };
  const refParameter = targetParameter("value", int64, "byref-readwrite");
  const refMember = {
    id: "Example.Target..ctor(ref System.Int64)",
    sourceName: "constructor",
    targetName: ".ctor",
    kind: "constructor",
    declaringType: targetType,
    parameters: [refParameter],
    overloadGroup: "Example.Target..ctor",
  };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [byValueMember, refMember],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: {},
    callKind: "construct",
    selectedSignature: selectedSignature,
    arguments: [refCall],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualSignatureSubject: selectedSignature,
    virtualSignatureDeclaration: byValueDeclaration,
    argumentPassingSubject: refCall,
    argumentPassing: {
      mode: "byref-readwrite",
      storageExpression: value,
    },
    sourcePrimitiveSubject: value,
    sourcePrimitive: {
      kind: "int64",
      runtimeBase: "number",
      signed: true,
      width: 64,
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
  assert.match(result.diagnostic.message, /could not map checked call '<anonymous>'/);
});
test("C# provider rejects argument-passing modes inconsistent with the exact selected target parameter", () => {
  const selectedSignature = {};
  const containerSymbol = {};
  const call = {};
  const outCall = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const outParameter = targetParameter("assigned", int32, "byref-writeonly-must-init");
  const selectedProviderDeclaration = {
    ...virtualMember("Example.Target.update", "update"),
    signatureId: "Example.Target.update(out System.Int32)",
  };
  const member = {
    id: selectedProviderDeclaration.signatureId,
    sourceName: "update",
    targetName: "Update",
    kind: "method",
    parameters: [outParameter],
    returnType: { kind: "source-primitive", name: "bool" },
    overloadGroup: "Example.Target.update",
  };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [member],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });
  const recordedFacts = [];

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: {},
    selectedSignature: selectedSignature,
    arguments: [outCall],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualSignatureSubject: selectedSignature,
    virtualSignatureDeclaration: selectedProviderDeclaration,
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-readwrite",
      storageExpression: int32,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider rejects constructor byref parameters without source marker facts", () => {
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
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [
      {
        ...constructorMember("Example.Target..ctor(out System.Int32)", { kind: "source-primitive", name: "int32" }),
        parameters: [
          targetParameter("value", { kind: "source-primitive", name: "int32" }, "byref-writeonly-must-init"),
        ],
      },
    ],
  };

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: { Kind: "KindNewExpression" },
    callee: {},
    callKind: "construct",
    selectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }), fakeObservationContext({
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
      ...virtualMember("Example.Target..ctor", "constructor"),
      signatureId: "Example.Target..ctor(out System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider prefers selected generic signatures when target argument facts tie", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = { kind: "source-primitive", name: "int32" };
  const genericMember = {
    id: "Example.Target.identity``1(T)",
    sourceName: "identity",
    targetName: "Identity",
    kind: "method",
    typeParameters: [{ name: "T" }],
    parameters: [{
      name: "value",
      type: { kind: "type-parameter", name: "T" },
      passingMode: "by-value",
    }],
    returnType: { kind: "type-parameter", name: "T" },
    overloadGroup: "Example.Target.identity",
  };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      genericMember,
      method("Example.Target.identity(System.Int32)", argument, {
        sourceName: "identity",
        targetName: "Identity",
        overloadGroup: "Example.Target.identity",
      }),
    ],
  };

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: {},
    callee: {},
    selectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.identity", "identity"),
      signatureId: genericMember.id,
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, genericMember.id);
  assert.deepEqual(result.value.selectedSignature.member.parameters[0].type, argument);
  assert.deepEqual(result.value.selectedSignature.member.returnType, argument);
});
test("C# provider keeps inferred generic method arguments after selected binding enrichment", () => {
  const selectedDeclaration = {};
  const containerSymbol = {};
  const receiver = { Kind: "KindIdentifier", Text: "referenceNew" };
  const call = {};
  const markedType = {
    kind: "target-named",
    id: "Acme.Constraints.Marked",
    csharpRender: { kind: "named", namespace: ["Acme", "Constraints"], name: "Marked" },
  };
  const declaringOpenType = {
    kind: "target-named",
    id: "Acme.Constraints.ReferenceNewTarget`1",
    typeArguments: [{ kind: "type-parameter", name: "T" }],
    csharpRender: { kind: "named", namespace: ["Acme", "Constraints"], name: "ReferenceNewTarget" },
  };
  const declaringClosedType = {
    ...declaringOpenType,
    typeArguments: [markedType],
  };
  const genericMember = {
    id: "Acme.Constraints.ReferenceNewTarget`1.Copy``1(TMethod)",
    sourceName: "copy",
    targetName: "Copy",
    kind: "method",
    declaringType: declaringOpenType,
    typeParameters: [{ name: "TMethod" }],
    parameters: [{
      name: "value",
      type: { kind: "type-parameter", name: "TMethod" },
      passingMode: "by-value",
    }],
    returnType: csharpVoidType(),
    overloadGroup: "Acme.Constraints.ReferenceNewTarget`1.Copy",
  };
  const binding = {
    id: "Acme.Constraints.ReferenceNewTarget`1",
    sourceName: "ReferenceNewTarget",
    targetName: "ReferenceNewTarget",
    target: "csharp",
    kind: "class",
    typeParameters: [{ name: "T" }],
    csharpType: declaringOpenType,
    members: [genericMember],
  };
  const provider = getNativeSemanticProvider({
    bindings: [
      binding,
      {
        id: markedType.id,
        sourceName: "Marked",
        targetName: "Marked",
        target: "csharp",
        kind: "class",
        csharpType: markedType,
      },
    ],
  });
  const recordedFacts = [];

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: propertyAccessCallee(receiver, "copy"),
    selectedDeclaration: selectedDeclaration,
    receiver,
    receiverType: declaringClosedType,
    methodTypeArguments: [{
      typeParameterName: "TMethod",
      selectedType: markedType,
    }],
    arguments: [markedType],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember(genericMember.id, "copy", binding.id),
      signatureId: genericMember.id,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, genericMember.id);
  assert.deepEqual(result.value.selectedSignature.member.parameters[0].type, { kind: "target-named", id: markedType.id });
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Void");

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.operationId, genericMember.id);
  assert.deepEqual(operation?.selectedMember.parameters[0].type, markedType);
});
test("C# provider keeps explicit generic method target arguments for selected provider signatures", () => {
  const selectedDeclaration = {};
  const containerSymbol = {};
  const call = { Kind: "KindCallExpression" };
  const stringType = csharpStringType();
  const stringArgument = stringType;
  const dtoType = {
    kind: "target-named",
    id: "Acme.Dto",
    csharpRender: { kind: "named", namespace: ["Acme"], name: "Dto" },
  };
  const selectedDtoType = {};
  const genericMember = {
    id: "Acme.Json.Read``1(System.String)",
    sourceName: "Read",
    targetName: "Read",
    kind: "method",
    static: true,
    declaringType: {
      kind: "target-named",
      id: "Acme.Json",
      csharpRender: { kind: "named", namespace: ["Acme"], name: "Json" },
    },
    typeParameters: [{ name: "T" }],
    parameters: [targetParameter("json", stringType)],
    returnType: { kind: "type-parameter", name: "T" },
    overloadGroup: "Acme.Json.Read",
  };
  const binding = {
    id: "Acme.Json",
    sourceName: "Json",
    targetName: "Json",
    target: "csharp",
    kind: "class",
    csharpType: genericMember.declaringType,
    members: [genericMember],
  };
  const provider = getNativeSemanticProvider({
    bindings: [
      binding,
      {
        id: dtoType.id,
        sourceName: "Dto",
        targetName: "Dto",
        target: "csharp",
        kind: "class",
        csharpType: dtoType,
      },
    ],
    targetTypesBySubject: new Map([[selectedDtoType, dtoType]]),
  });
  const recordedFacts = [];

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: {},
    selectedDeclaration: selectedDeclaration,
    methodTypeArguments: [{
      typeParameterName: "T",
      selectedType: selectedDtoType,
    }],
    arguments: [stringArgument],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember(genericMember.id, "Read", binding.id),
      signatureId: genericMember.id,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.deepEqual(result.value.selectedSignature.targetTypeArguments, [{ kind: "target-named", id: dtoType.id }]);
  assert.deepEqual(result.value.selectedSignature.member.returnType, { kind: "target-named", id: dtoType.id });

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.operationId, genericMember.id);
  assert.deepEqual(operation?.selectedMember.returnType, dtoType);
});
test("C# provider trusts TSTS-selected generic source arguments when target carrier facts are lossy", () => {
  const selectedDeclaration = {};
  const containerSymbol = {};
  const call = { Kind: "KindCallExpression" };
  const argument = {};
  const sourceCarrierType = {
    kind: "target-named",
    id: "Acme.SourceCarrier",
    csharpRender: { kind: "named", namespace: ["Acme"], name: "SourceCarrier" },
  };
  const dtoType = {
    kind: "target-named",
    id: "Acme.Dto",
    csharpRender: { kind: "named", namespace: ["Acme"], name: "Dto" },
  };
  const selectedDtoType = {};
  const genericMember = {
    id: "Acme.Json.Write``1(T)",
    sourceName: "Write",
    targetName: "Write",
    kind: "method",
    static: true,
    typeParameters: [{ name: "T" }],
    parameters: [{
      name: "value",
      type: { kind: "type-parameter", name: "T" },
      passingMode: "by-value",
    }],
    returnType: csharpVoidType(),
    overloadGroup: "Acme.Json.Write",
  };
  const binding = {
    id: "Acme.Json",
    sourceName: "Json",
    targetName: "Json",
    target: "csharp",
    kind: "class",
    members: [genericMember],
  };
  const provider = getNativeSemanticProvider({
    bindings: [
      binding,
      {
        id: dtoType.id,
        sourceName: "Dto",
        targetName: "Dto",
        target: "csharp",
        kind: "class",
        csharpType: dtoType,
      },
      {
        id: sourceCarrierType.id,
        sourceName: "SourceCarrier",
        targetName: "SourceCarrier",
        target: "csharp",
        kind: "class",
        csharpType: sourceCarrierType,
      },
    ],
    targetTypesBySubject: new Map([[selectedDtoType, dtoType]]),
  });

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: {},
    selectedDeclaration: selectedDeclaration,
    methodTypeArguments: [{
      typeParameterName: "T",
      selectedType: selectedDtoType,
    }],
    arguments: [argument],
    sourceArgumentTypes: [sourceCarrierType],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember(genericMember.id, "Write", binding.id),
      signatureId: genericMember.id,
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.deepEqual(result.value.selectedSignature.member.parameters[0].type, { kind: "target-named", id: dtoType.id });
});
