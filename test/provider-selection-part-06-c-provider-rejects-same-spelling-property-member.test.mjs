import { test, assert, argumentPassingFactKey, attributeFactKey, defaultValueFactKey, deferObservation, fieldFactKey, flowStateFactKey, functionPointerFactKey, pointerFactKey, providerVirtualDeclarationFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetBindingFactKey, csharpTargetOperationFactKey, createCsharpNativeOperationsProvider, selectTargetMember, csharpNullableValueTargetType, csharpSourcePrimitiveDotnetMetadataName, resolveTargetTypeRefFromSubjectFacts, checkedCallRequest, checkedPropertyRequest, checkedElementRequest, getNativeSemanticProvider, method, property, field, eventMember, constructorMember, targetParameterWithOptions, unsupportedMember, assertUnsupportedDiagnosticEvidence, indexer, csharpStringType, csharpObjectType, csharpVoidType, csharpReadOnlySpanType, csharpIEnumerableType, overlapExtensionsBinding, overlapMethod, targetParameter, spanType, readOnlySpanType, coreLangMarker, virtualMember, propertyAccessCallee, targetIdFromMemberId, fakeObservationContext } from "./provider-selection.helpers.mjs";

test("C# provider rejects same-spelling property members without selected member identity", () => {
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
      property("Example.Target.other", "m", "Other"),
    ],
  };

  const result = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression,
    receiver,
    selectedSymbol: selectedDeclaration,
    propertyName: "m",
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.missing"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_NOT_FOUND");
});
test("C# provider closes selected generic property results only from TSTS sourceResultType evidence", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const expression = {};
  const receiver = {};
  const recordedFacts = [];
  const binding = {
    id: "Example.Box",
    sourceName: "Box",
    targetName: "Box",
    target: "csharp",
    kind: "class",
    typeParameters: [{ name: "T" }],
    members: [{
      id: "Example.Box.Value",
      sourceName: "Value",
      targetName: "Value",
      kind: "property",
      parameters: [],
      returnType: { kind: "type-parameter", name: "T" },
    }],
  };
  const context = fakeObservationContext({
    targetBinding: binding,
    recordedFacts,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Box.Value", "Value"),
  });

  const accepted = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression,
    receiver,
    selectedSymbol: selectedDeclaration,
    sourceResultType: csharpStringType(),
    propertyName: "Value",
  }), context);
  const missingEvidence = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression: {},
    receiver,
    selectedSymbol: selectedDeclaration,
    propertyName: "Value",
  }), context);

  assert.equal(accepted.kind, "accept");
  assert.deepEqual(accepted.value.resultType, { kind: "target-named", id: "System.String" });
  assert.deepEqual(
    recordedFacts.find((fact) => fact.subject === expression && fact.key === csharpTargetOperationFactKey)?.value.resultType,
    csharpStringType(),
  );
  assert.equal(missingEvidence.kind, "reject");
  assert.equal(missingEvidence.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_NOT_RENDERABLE");
});
test("C# provider preserves an exact closed target result across lossy source-result projection", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [property("Example.Target.Value", "Value", "Value")],
  };
  const result = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    selectedSymbol: selectedDeclaration,
    sourceResultType: { kind: "source-primitive", name: "float64" },
    propertyName: "Value",
  }), fakeObservationContext({
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.Value", "Value"),
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.extensionCode : undefined);
  assert.deepEqual(result.value.resultType, { kind: "source-primitive", name: "int32" });
});
test("C# provider rejects selected source-result evidence with the wrong open target shape", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const binding = {
    id: "Example.Box",
    sourceName: "Box",
    targetName: "Box",
    target: "csharp",
    kind: "class",
    typeParameters: [{ name: "T" }],
    members: [{
      id: "Example.Box.Value",
      sourceName: "Value",
      targetName: "Value",
      kind: "property",
      parameters: [],
      returnType: {
        kind: "tuple",
        elements: [{ kind: "type-parameter", name: "T" }],
      },
    }],
  };
  const result = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    selectedSymbol: selectedDeclaration,
    sourceResultType: {
      kind: "array",
      element: csharpStringType(),
    },
    propertyName: "Value",
  }), fakeObservationContext({
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Box.Value", "Value"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_NOT_RENDERABLE");
});
test("C# provider reports selected unsupported property identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const recordedFacts = [];
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      property("Example.Target.FallbackPointerProperty", "pointerProperty", "FallbackPointerProperty"),
    ],
    unsupportedMembers: [
      unsupportedMember("property", "Example.Target.PointerProperty", "pointerProperty", "PointerProperty", "Property type cannot be represented as closed .NET target type facts. System.Int32* is unsupported."),
    ],
  };

  const result = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    selectedSymbol: selectedDeclaration,
    propertyName: "unrelated",
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.PointerProperty", "pointerProperty"),
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Property type cannot be represented/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, "Example.Target.PointerProperty", "property");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider rejects events even when target facts exist until event source semantics exist", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const recordedFacts = [];
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      property("Example.Target.FallbackChanged", "changed", "FallbackChanged"),
      eventMember("Example.Target.Changed", "changed", "Changed"),
    ],
    unsupportedMembers: [
      unsupportedMember("event", "Example.Target.Changed", "changed", "Changed", "C# events require explicit add/remove subscription semantics; the provider records this event as unsupported until source event facts exist."),
    ],
  };

  const result = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    selectedSymbol: selectedDeclaration,
    propertyName: "changed",
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.Changed", "changed"),
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_EVENT_UNSUPPORTED");
  assert.match(result.diagnostic.message, /add\/remove subscription semantics/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, "Example.Target.Changed", "event");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider reports selected unsupported call identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const recordedFacts = [];
  const signatureId = "Example.Target.PointerReturn(System.Int32*)";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.FallbackPointerReturn(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "pointerReturn", targetName: "PointerReturn", overloadGroup: "Example.Target.FallbackPointerReturn" }),
    ],
    unsupportedMembers: [
      unsupportedMember("method", signatureId, "pointerReturn", "PointerReturn", "Method return type cannot be represented as closed .NET target type facts. System.Int32* is unsupported."),
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
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.PointerReturn", "pointerReturn"),
      signatureId,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Method return type cannot be represented/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, signatureId, "method");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider reports selected unsupported constructor identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const recordedFacts = [];
  const signatureId = "Example.Target..ctor(System.Int32*)";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      constructorMember("Example.Target..ctor(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
    unsupportedMembers: [
      unsupportedMember("constructor", signatureId, "constructor", ".ctor", "Constructor signature contains parameter 'pointer' with type 'System.Int32*' that cannot be represented as closed .NET target type facts."),
    ],
  };

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: {},
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
      signatureId,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Constructor signature contains parameter 'pointer'/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, signatureId, "constructor");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider reports selected unsupported indexer identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = {};
  const recordedFacts = [];
  const signatureId = "Example.Target.Item(System.Int32*)";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      indexer("Example.Target.FallbackItem(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "item", overloadGroup: "Example.Target.FallbackItem" }),
    ],
    unsupportedMembers: [
      unsupportedMember("indexer", signatureId, "item", "Item", "Indexer signature contains parameter 'pointer' with type 'System.Int32*' that cannot be represented as closed .NET target type facts."),
    ],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
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
      ...virtualMember("Example.Target.Item", "item"),
      signatureId,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_INDEXER_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Indexer signature contains parameter 'pointer'/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, signatureId, "indexer");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider closes selected generic indexer results from TSTS sourceResultType evidence", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = {};
  const acceptedExpression = {};
  const recordedFacts = [];
  const signatureId = "Example.Box.Item(System.Int32)";
  const binding = {
    id: "Example.Box",
    sourceName: "Box",
    targetName: "Box",
    target: "csharp",
    kind: "class",
    typeParameters: [{ name: "T" }],
    members: [{
      id: signatureId,
      sourceName: "Item",
      targetName: "Item",
      kind: "indexer",
      overloadGroup: "Example.Box.Item",
      parameters: [{
        name: "index",
        type: { kind: "source-primitive", name: "int32" },
        passingMode: "by-value",
      }],
      returnType: { kind: "type-parameter", name: "T" },
    }],
  };
  const context = fakeObservationContext({
    targetBindingSubject: receiverType,
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
      ...virtualMember("Example.Box.Item", "Item"),
      signatureId,
    },
    recordedFacts,
  });

  const accepted = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression: acceptedExpression,
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    sourceResultType: csharpStringType(),
    argument,
  }), context);
  const missingEvidence = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), context);

  assert.equal(accepted.kind, "accept");
  assert.deepEqual(accepted.value.resultType, { kind: "target-named", id: "System.String" });
  assert.deepEqual(
    recordedFacts.find((fact) => fact.subject === acceptedExpression && fact.key === csharpTargetOperationFactKey)?.value.resultType,
    csharpStringType(),
  );
  assert.equal(missingEvidence.kind, "reject");
  assert.equal(missingEvidence.diagnostic.extensionCode, "CSHARP_TARGET_INDEXER_NOT_RENDERABLE");
});
test("C# provider does not infer unsupported identity from metadata-name-only matches", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const binding = {
    id: "Test.Assembly::Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    unsupportedMembers: [
      unsupportedMember("property", "Test.Assembly::Example.Target.PointerProperty", "pointerProperty", "PointerProperty", "Property type cannot be represented as closed .NET target type facts.", {
        metadataName: "Example.Target.PointerProperty",
      }),
    ],
  };

  const result = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    selectedSymbol: selectedDeclaration,
    propertyName: "pointerProperty",
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.PointerProperty", "pointerProperty"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_NOT_FOUND");
  assert.doesNotMatch(result.diagnostic.message, /Property type cannot be represented/u);
});
test("C# provider preserves exact selected indexer signatures instead of refining to siblings", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      indexer("Example.Target.other(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "Item", overloadGroup: "Example.Target.other" }),
      indexer("Example.Target.Item(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "renamed" }),
      indexer("Example.Target.Item(System.Int64)", { kind: "source-primitive", name: "int64" }, { sourceName: "renamed" }),
    ],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
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
      ...virtualMember("Example.Target.Item", "renamed"),
      signatureId: "Example.Target.Item(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.extensionCode : undefined);
  assert.equal(result.value.operation.operationId, "Example.Target.Item(System.Int64)");
});
test("C# provider maps selected string indexers from provider signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = csharpStringType();
  const binding = {
    id: "Example.Headers",
    sourceName: "Headers",
    targetName: "Headers",
    target: "csharp",
    kind: "class",
    members: [
      indexer("Example.Headers.Item(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "item", overloadGroup: "Example.Headers.Item" }),
      indexer("Example.Headers.Item(System.String)", csharpStringType(), { sourceName: "item", overloadGroup: "Example.Headers.Item" }),
    ],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Headers.Item", "item"),
      signatureId: "Example.Headers.Item(System.String)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.operation.operationId, "Example.Headers.Item(System.String)");
});
test("C# provider closes selected indexer arguments through provider conversion metadata", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const expression = {};
  const argument = { kind: "source-primitive", name: "int32" };
  const recordedFacts = [];
  const objectType = csharpObjectType();
  const member = {
    ...indexer("Example.Headers.Item(System.Object)", objectType, { sourceName: "item", overloadGroup: "Example.Headers.Item" }),
    parameters: [{
      name: "key",
      type: objectType,
      passingMode: "by-value",
      csharpAcceptsClosedSourceArgument: true,
    }],
  };
  const binding = {
    id: "Example.Headers",
    sourceName: "Headers",
    targetName: "Headers",
    target: "csharp",
    kind: "class",
    members: [member],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression,
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Headers.Item", "item"),
      signatureId: member.id,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.operation.operationId, member.id);
  const csharpOperation = recordedFacts.find((fact) => fact.subject === expression && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(csharpOperation?.selectedMember?.parameters[0]?.csharpAcceptsClosedSourceArgument, true);
  assert.deepEqual(csharpOperation?.selectedMember?.parameters[0]?.type, objectType);
});
test("C# provider rejects selected indexer conversions without provider metadata", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const expression = {};
  const argument = { kind: "source-primitive", name: "int32" };
  const recordedFacts = [];
  const objectType = csharpObjectType();
  const member = indexer("Example.Headers.Item(System.Object)", objectType, { sourceName: "item", overloadGroup: "Example.Headers.Item" });
  const binding = {
    id: "Example.Headers",
    sourceName: "Headers",
    targetName: "Headers",
    target: "csharp",
    kind: "class",
    members: [member],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression,
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Headers.Item", "item"),
      signatureId: member.id,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_INDEXER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider rejects indexer conversion metadata without exact signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const expression = {};
  const argument = { kind: "source-primitive", name: "int32" };
  const recordedFacts = [];
  const objectType = csharpObjectType();
  const member = {
    ...indexer("Example.Headers.Item(System.Object)", objectType, { sourceName: "item", overloadGroup: "Example.Headers.Item" }),
    parameters: [{
      name: "key",
      type: objectType,
      passingMode: "by-value",
      csharpAcceptsClosedSourceArgument: true,
    }],
  };
  const binding = {
    id: "Example.Headers",
    sourceName: "Headers",
    targetName: "Headers",
    target: "csharp",
    kind: "class",
    members: [member],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression,
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Headers.Item", "item"),
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_INDEXER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider does not select the sole target indexer without exact provider signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const expression = {};
  const argument = {};
  const recordedFacts = [];
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = indexer("Example.Values.Item(System.Int32)", int32, {
    sourceName: "item",
    overloadGroup: "Example.Values.Item",
  });
  const binding = {
    id: "Example.Values",
    sourceName: "Values",
    targetName: "Values",
    target: "csharp",
    kind: "class",
    members: [member],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression,
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Values.Item", "item"),
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_INDEXER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider maps selected byref indexers from source marker target expressions", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const outCall = {};
  const value = {};
  const recordedFacts = [];
  const int32 = { kind: "source-primitive", name: "int32" };
  const binding = {
    id: "Example.RefIndexer",
    sourceName: "RefIndexer",
    targetName: "RefIndexer",
    target: "csharp",
    kind: "class",
    members: [
      indexer("Example.RefIndexer.Item(System.Int32)", int32, { sourceName: "item", overloadGroup: "Example.RefIndexer.Item" }),
      {
        id: "Example.RefIndexer.Item(out System.Int32)",
        sourceName: "item",
        targetName: "Item",
        kind: "indexer",
        parameters: [targetParameter("value", int32, "byref-writeonly-must-init")],
        returnType: csharpStringType(),
        overloadGroup: "Example.RefIndexer.Item",
      },
    ],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument: outCall,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: value,
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
      ...virtualMember("Example.RefIndexer.Item", "item"),
      signatureId: "Example.RefIndexer.Item(out System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.operation.operationId, "Example.RefIndexer.Item(out System.Int32)");
  const csharpOperation = recordedFacts.find((fact) => fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(csharpOperation?.selectedMember?.parameters[0]?.passingMode, "byref-writeonly-must-init");
});
test("C# provider rejects selected byref indexers without source marker facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = {};
  const recordedFacts = [];
  const int32 = { kind: "source-primitive", name: "int32" };
  const binding = {
    id: "Example.RefIndexer",
    sourceName: "RefIndexer",
    targetName: "RefIndexer",
    target: "csharp",
    kind: "class",
    members: [{
      id: "Example.RefIndexer.Item(out System.Int32)",
      sourceName: "item",
      targetName: "Item",
      kind: "indexer",
      parameters: [targetParameter("value", int32, "byref-writeonly-must-init")],
      returnType: csharpStringType(),
      overloadGroup: "Example.RefIndexer.Item",
    }],
  };

  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    selectedSymbol: selectedDeclaration,
    argument,
  }), fakeObservationContext({
    targetBindingSubject: receiverType,
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
      ...virtualMember("Example.RefIndexer.Item", "item"),
      signatureId: "Example.RefIndexer.Item(out System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_INDEXER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider rejects element access without TSTS-selected element evidence", () => {
  const provider = getNativeSemanticProvider();
  const result = provider.mapCheckedElementAccess(checkedElementRequest({
    target: "csharp",
    expression: {},
    receiver: {},
    argument: {},
  }), fakeObservationContext({}));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_ELEMENT_ACCESS_NOT_MAPPED");
});
test("C# object-shape property access requires the exact TSTS-selected member subject", () => {
  const receiver = {};
  const selectedDeclaration = {};
  const sameSpellingDeclaration = {};
  const objectShape = {
    targetType: { kind: "target-named", id: "Example.Shape" },
    members: [{
      sourceName: "value",
      sourceSubjects: [selectedDeclaration],
      targetName: "Value",
      memberKind: "property",
      type: csharpStringType(),
    }],
  };
  const provider = getNativeSemanticProvider({
    objectShapesBySubject: new Map([[receiver, objectShape]]),
  });

  const accepted = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression: {},
    receiver,
    propertyName: "value",
    selectedDeclaration: selectedDeclaration,
  }), fakeObservationContext({}));
  const rejected = provider.mapCheckedPropertyAccess(checkedPropertyRequest({
    target: "csharp",
    expression: {},
    receiver,
    propertyName: "value",
    selectedDeclaration: sameSpellingDeclaration,
  }), fakeObservationContext({}));

  assert.equal(accepted.kind, "accept");
  assert.equal(accepted.value.operation.targetOperation, "Value");
  assert.equal(rejected.kind, "reject");
  assert.equal(rejected.diagnostic.extensionCode, "CSHARP_PROPERTY_ACCESS_NOT_MAPPED");
});
