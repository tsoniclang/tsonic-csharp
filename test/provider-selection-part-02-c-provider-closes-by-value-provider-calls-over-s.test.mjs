import { test, assert, argumentPassingFactKey, attributeFactKey, defaultValueFactKey, deferObservation, fieldFactKey, flowStateFactKey, functionPointerFactKey, pointerFactKey, providerVirtualDeclarationFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetBindingFactKey, csharpTargetOperationFactKey, createCsharpNativeOperationsProvider, selectTargetMember, csharpNullableValueTargetType, csharpSourcePrimitiveDotnetMetadataName, resolveTargetTypeRefFromSubjectFacts, checkedCallRequest, selectedTargetSignatureFact, getNativeSemanticProvider, method, property, field, eventMember, constructorMember, targetParameterWithOptions, unsupportedMember, assertUnsupportedDiagnosticEvidence, indexer, csharpStringType, csharpObjectType, csharpVoidType, csharpReadOnlySpanType, csharpIEnumerableType, overlapExtensionsBinding, overlapMethod, targetParameter, spanType, readOnlySpanType, coreLangMarker, virtualMember, propertyAccessCallee, targetIdFromMemberId, fakeObservationContext } from "./provider-selection.helpers.mjs";

test("C# provider closes by-value provider calls over selected signature identity and argument conversions", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const selectedSignature = {};
  const containerSymbol = {};
  const argument = {};
  const call = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const recordedFacts = [];
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", int32),
    ],
  };

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: {},
    selectedDeclaration: selectedDeclaration,
    selectedSignature: selectedSignature,
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
    virtualSignatureSubject: selectedSignature,
    virtualSignatureDeclaration: {
      ...virtualMember("Example.Target.m", "m"),
      signatureId: "Example.Target.m(System.Int32)",
    },
    virtualDeclarationSubject: selectedDeclaration,
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.providerDeclaration.signatureId, "Example.Target.m(System.Int32)");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
  assert.deepEqual(result.value.argumentConversions, [{
    sourceArgumentIndex: 0,
    sourceForm: "value",
    targetParameterIndex: 0,
    targetForm: "parameter",
  }]);
  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.selectedMember?.parameters[0]?.passingMode, "by-value");
});
test("C# provider preserves optional defaults and params-array conversion closure", () => {
  const selectedSignature = {};
  const containerSymbol = {};
  const required = csharpStringType();
  const label = csharpStringType();
  const first = { kind: "source-primitive", name: "int32" };
  const second = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "Example.Target.log(System.String,System.String,System.Int32[])",
    sourceName: "log",
    targetName: "Log",
    kind: "method",
    parameters: [
      targetParameter("required", csharpStringType()),
      {
        name: "label",
        type: csharpStringType(),
        passingMode: "by-value",
        optional: true,
        defaultValue: { kind: "string", value: "proved" },
        csharpOmittableOptionalArgument: true,
      },
      {
        name: "items",
        type: { kind: "array", element: first },
        passingMode: "by-value",
        paramsArray: true,
      },
    ],
    returnType: csharpVoidType(),
    overloadGroup: "Example.Target.log",
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
    call: {},
    callee: {},
    selectedSignature: selectedSignature,
    arguments: [required, label, first, second],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualSignatureSubject: selectedSignature,
    virtualSignatureDeclaration: {
      ...virtualMember("Example.Target.log", "log"),
      signatureId: member.id,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.parameters[1]?.optional, true);
  assert.equal(result.value.selectedSignature.member.parameters[2]?.paramsArray, true);
  assert.deepEqual(result.value.argumentConversions, [
    { sourceArgumentIndex: 0, sourceForm: "value", targetParameterIndex: 0, targetForm: "parameter" },
    { sourceArgumentIndex: 1, sourceForm: "value", targetParameterIndex: 1, targetForm: "parameter" },
    { sourceArgumentIndex: 2, sourceForm: "value", targetParameterIndex: 2, targetForm: "params-element" },
    { sourceArgumentIndex: 3, sourceForm: "value", targetParameterIndex: 2, targetForm: "params-element" },
  ]);
  const selectedOperation = recordedFacts.find((fact) => fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(selectedOperation?.selectedMember?.parameters[1]?.defaultValue?.value, "proved");
  assert.equal(selectedOperation?.selectedMember?.parameters[2]?.paramsArray, true);
});
test("C# provider rejects selected calls when no target binding proves ownership", () => {
  const provider = getNativeSemanticProvider();
  const calleeSymbol = {};
  const argument = {};
  const call = {};

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: {},
    selectedCalleeSymbol: calleeSymbol,
    arguments: [argument],
  }), fakeObservationContext({
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_CHECKED_CALL_TARGET_BINDING_NOT_PROVEN");
  assert.equal(result.diagnostic.nodeOrSpan, call);
});
test("C# provider hard-rejects TSTS-selected untyped calls as dynamic any operations", () => {
  const provider = getNativeSemanticProvider();
  const call = {};

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call,
    callee: {},
    selectionKind: "untyped",
    arguments: [],
  }), fakeObservationContext());

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED");
  assert.equal(result.diagnostic.nodeOrSpan, call);
  assert.match(result.diagnostic.message, /call emission uses TypeScript any in strict-native mode/u);
});
test("C# provider rejects applicable calls without selected target ownership", () => {
  const provider = getNativeSemanticProvider();
  const argument = {};

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: {},
    callee: {},
    arguments: [argument],
  }), fakeObservationContext({
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_CHECKED_CALL_TARGET_BINDING_NOT_PROVEN");
});
test("C# erased source marker rejects missing provider member identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: {},
    callee: {},
    selectedDeclaration: selectedDeclaration,
    arguments: [],
  }), fakeObservationContext({
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "@tsonic/core/lang.js",
      artifactFileName: "tsts-provider://test",
      exportName: "out",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_ERASED_SOURCE_MARKER_IDENTITY_NOT_PROVEN");
  assert.equal("value" in result, false);
});
test("C# source marker mapping rejects unowned same-spelling non-core virtual declarations", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};

  const result = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: {},
    callee: {},
    selectedDeclaration: selectedDeclaration,
    arguments: [],
  }), fakeObservationContext({
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "./local.js",
      moduleSpecifier: "./local.js",
      artifactFileName: "tsts-provider://local",
      exportName: "out",
      memberId: "./local.js::out",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_CHECKED_CALL_TARGET_BINDING_NOT_PROVEN");
});
test("C# erased source marker rejects missing finalized source facts", () => {
  const provider = getNativeSemanticProvider();
  const cases = [
    ["out", "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN"],
    ["ref", "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN"],
    ["inref", "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN"],
    ["borrow", "CSHARP_FLOW_MARKER_FACT_NOT_PROVEN"],
    ["borrowMut", "CSHARP_FLOW_MARKER_FACT_NOT_PROVEN"],
    ["move", "CSHARP_FLOW_MARKER_FACT_NOT_PROVEN"],
    ["field", "CSHARP_FIELD_MARKER_FACT_NOT_PROVEN"],
    ["defaultof", "CSHARP_DEFAULT_MARKER_FACT_NOT_PROVEN"],
    ["struct", "CSHARP_STRUCT_MARKER_FACT_NOT_PROVEN"],
  ];

  for (const [marker, code] of cases) {
    const call = {};
    const selectedDeclaration = {};
    const result = provider.mapCheckedCall(checkedCallRequest({
      target: "csharp",
      call,
      callee: {},
      selectedDeclaration: selectedDeclaration,
      arguments: [],
    }), fakeObservationContext({
      virtualDeclarationSubject: selectedDeclaration,
      virtualDeclaration: coreLangMarker(marker),
    }));

    assert.equal(result.kind, "reject", marker);
    assert.equal(result.diagnostic.extensionCode, code);
  }
});
test("C# erased source marker rejects unsupported flow markers even with finalized source facts", () => {
  const provider = getNativeSemanticProvider();
  const cases = [
    ["borrow", "borrowed-shared"],
    ["borrowMut", "borrowed-mut"],
    ["move", "moved"],
  ];

  for (const [marker, state] of cases) {
    const call = {};
    const selectedDeclaration = {};
    const result = provider.mapCheckedCall(checkedCallRequest({
      target: "csharp",
      call,
      callee: {},
      selectedDeclaration: selectedDeclaration,
      arguments: [],
    }), fakeObservationContext({
      virtualDeclarationSubject: selectedDeclaration,
      virtualDeclaration: coreLangMarker(marker),
      flowStateSubject: call,
      flowState: { state },
    }));

    assert.equal(result.kind, "reject", marker);
    assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED");
    assert.match(result.diagnostic.message, new RegExp(marker, "u"));
  }
});
test("C# source markers validate finalized facts before selected signature reuse", () => {
  const provider = getNativeSemanticProvider();
  const markerType = { kind: "source-primitive", name: "int32" };
  const selectedMember = {
    id: "Example.Identity.SourceMarker",
    sourceName: "out",
    targetName: "SourceMarker",
    kind: "method",
    parameters: [{
      name: "value",
      type: markerType,
      passingMode: "by-value",
    }],
  };
  const targetExpression = { Kind: 1, Text: "value" };
  const outCall = {};
  const outDeclaration = {};
  const outRequest = checkedCallRequest({
    target: "csharp",
    call: outCall,
    callee: {},
    selectedDeclaration: outDeclaration,
    arguments: [targetExpression],
  });
  const oneArgumentSlots = [{
    sourceArgumentIndex: 0,
    sourceForm: "value",
    targetParameterIndex: 0,
    targetForm: "parameter",
  }];
  const missingOut = provider.mapCheckedCall(outRequest, fakeObservationContext({
    virtualDeclarationSubject: outDeclaration,
    virtualDeclaration: coreLangMarker("out"),
    selectedSignatureSubject: outCall,
    selectedSignature: selectedTargetSignatureFact(outRequest, selectedMember, oneArgumentSlots),
  }));

  assert.equal(missingOut.kind, "reject");
  assert.equal(missingOut.diagnostic.extensionCode, "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN");

  const borrowCall = {};
  const borrowDeclaration = {};
  const borrowRequest = checkedCallRequest({
    target: "csharp",
    call: borrowCall,
    callee: {},
    selectedDeclaration: borrowDeclaration,
    arguments: [targetExpression],
  });
  const unsupportedBorrow = provider.mapCheckedCall(borrowRequest, fakeObservationContext({
    virtualDeclarationSubject: borrowDeclaration,
    virtualDeclaration: coreLangMarker("borrow"),
    selectedSignatureSubject: borrowCall,
    selectedSignature: selectedTargetSignatureFact(borrowRequest, selectedMember, oneArgumentSlots),
    flowStateSubject: borrowCall,
    flowState: { state: "borrowed-shared" },
  }));

  assert.equal(unsupportedBorrow.kind, "reject");
  assert.equal(unsupportedBorrow.diagnostic.extensionCode, "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED");

  const validOutCall = {};
  const validOutDeclaration = {};
  const validOutRequest = checkedCallRequest({
    target: "csharp",
    call: validOutCall,
    callee: {},
    selectedDeclaration: validOutDeclaration,
    arguments: [targetExpression],
    sourceParameterTypes: [markerType],
  });
  const validOut = provider.mapCheckedCall(validOutRequest, fakeObservationContext({
    virtualDeclarationSubject: validOutDeclaration,
    virtualDeclaration: coreLangMarker("out"),
    selectedSignatureSubject: validOutCall,
    selectedSignature: selectedTargetSignatureFact(validOutRequest, selectedMember, oneArgumentSlots),
    argumentPassingSubject: validOutCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression,
    },
  }));

  assert.equal(validOut.kind, "accept", validOut.kind === "reject" ? validOut.diagnostic.message : undefined);
  assert.equal(validOut.value.selectedSignature.member.id, "@tsonic/core/lang.js::out");
});
test("C# source markers reject malformed finalized facts", () => {
  const provider = getNativeSemanticProvider();
  const targetExpression = { Kind: 1, Text: "value" };
  const typeNode = { Kind: "KindTypeReference", Text: "int32" };
  const cases = [
    {
      marker: "out",
      code: "CSHARP_ARGUMENT_MARKER_MODE_NOT_PROVEN",
      options: {
        argumentPassing: {
          mode: "byref-readwrite",
          targetExpression,
        },
      },
    },
    {
      marker: "out",
      code: "CSHARP_ARGUMENT_MARKER_STORAGE_NOT_PROVEN",
      options: {
        argumentPassing: {
          mode: "byref-writeonly-must-init",
        },
      },
    },
    {
      marker: "field",
      code: "CSHARP_FIELD_MARKER_TYPE_NOT_PROVEN",
      options: {
        field: {
          name: "value",
        },
      },
    },
    {
      marker: "field",
      code: "CSHARP_FIELD_MARKER_NAME_NOT_PROVEN",
      options: {
        field: {
          type: typeNode,
        },
      },
    },
    {
      marker: "defaultof",
      code: "CSHARP_DEFAULT_MARKER_TYPE_NOT_PROVEN",
      options: {
        defaultValue: {},
      },
    },
    {
      marker: "struct",
      code: "CSHARP_STRUCT_MARKER_VALUE_TYPE_NOT_PROVEN",
      options: {
        structFact: {
          valueType: false,
          fields: [],
        },
      },
    },
    {
      marker: "struct",
      code: "CSHARP_STRUCT_MARKER_FIELDS_NOT_PROVEN",
      options: {
        structFact: {
          valueType: true,
        },
      },
    },
  ];

  for (const scenario of cases) {
    const call = {};
    const selectedDeclaration = {};
    const result = provider.mapCheckedCall(checkedCallRequest({
      target: "csharp",
      call,
      callee: {},
      selectedDeclaration: selectedDeclaration,
      arguments: [],
    }), fakeObservationContext({
      virtualDeclarationSubject: selectedDeclaration,
      virtualDeclaration: coreLangMarker(scenario.marker),
      argumentPassingSubject: call,
      fieldSubject: call,
      defaultValueSubject: call,
      structFactSubject: call,
      ...scenario.options,
    }));

    assert.equal(result.kind, "reject", scenario.marker);
    assert.equal(result.diagnostic.extensionCode, scenario.code);
    assert.ok(result.diagnostic.evidence?.length > 0);
  }
});
test("C# attribute builder marker rejects malformed finalized attribute facts", () => {
  const provider = getNativeSemanticProvider();
  const cases = [
    {
      code: "CSHARP_ATTRIBUTE_MARKER_TARGET_NOT_PROVEN",
      attribute: {
        kind: "builder-state",
      },
    },
    {
      code: "CSHARP_ATTRIBUTE_MARKER_TYPE_NOT_PROVEN",
      attribute: {
        kind: "application",
        applicationTarget: {},
        arguments: [],
      },
    },
  ];

  for (const scenario of cases) {
    const call = {};
    const result = provider.mapCheckedCall(checkedCallRequest({
      target: "csharp",
      call,
      callee: {},
      arguments: [],
    }), fakeObservationContext({
      attributeSubject: call,
      attribute: scenario.attribute,
    }));

    assert.equal(result.kind, "reject", scenario.code);
    assert.equal(result.diagnostic.extensionCode, scenario.code);
    assert.ok(result.diagnostic.evidence?.length > 0);
  }
});
test("C# erased source marker accepts supported markers only with finalized source facts", () => {
  const provider = getNativeSemanticProvider();
  const outCall = {};
  const outDeclaration = {};
  const defaultCall = {};
  const defaultDeclaration = {};
  const fieldCall = {};
  const fieldDeclaration = {};
  const structCall = {};
  const structDeclaration = {};
  const targetExpression = { Kind: 1, Text: "value" };
  const typeNode = { Kind: "KindTypeReference", Text: "int32" };
  const markerType = { kind: "source-primitive", name: "int32" };

  const outResult = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: outCall,
    callee: {},
    selectedDeclaration: outDeclaration,
    arguments: [targetExpression],
    sourceParameterTypes: [markerType],
  }), fakeObservationContext({
    virtualDeclarationSubject: outDeclaration,
    virtualDeclaration: coreLangMarker("out"),
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression,
    },
  }));

  const refCall = {};
  const refDeclaration = {};
  const refResult = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: refCall,
    callee: {},
    selectedDeclaration: refDeclaration,
    arguments: [targetExpression],
    sourceParameterTypes: [markerType],
  }), fakeObservationContext({
    virtualDeclarationSubject: refDeclaration,
    virtualDeclaration: coreLangMarker("ref"),
    argumentPassingSubject: refCall,
    argumentPassing: {
      mode: "byref-readwrite",
      targetExpression,
    },
  }));

  const inrefCall = {};
  const inrefDeclaration = {};
  const inrefResult = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: inrefCall,
    callee: {},
    selectedDeclaration: inrefDeclaration,
    arguments: [targetExpression],
    sourceParameterTypes: [markerType],
  }), fakeObservationContext({
    virtualDeclarationSubject: inrefDeclaration,
    virtualDeclaration: coreLangMarker("inref"),
    argumentPassingSubject: inrefCall,
    argumentPassing: {
      mode: "byref-readonly",
      targetExpression,
    },
  }));

  const defaultResult = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: defaultCall,
    callee: {},
    selectedDeclaration: defaultDeclaration,
    arguments: [],
  }), fakeObservationContext({
    virtualDeclarationSubject: defaultDeclaration,
    virtualDeclaration: coreLangMarker("defaultof"),
    defaultValueSubject: defaultCall,
    defaultValue: {
      type: typeNode,
    },
  }));

  const fieldResult = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: fieldCall,
    callee: {},
    selectedDeclaration: fieldDeclaration,
    arguments: [],
  }), fakeObservationContext({
    virtualDeclarationSubject: fieldDeclaration,
    virtualDeclaration: coreLangMarker("field"),
    fieldSubject: fieldCall,
    field: {
      name: "count",
      type: typeNode,
    },
  }));

  const structResult = provider.mapCheckedCall(checkedCallRequest({
    target: "csharp",
    call: structCall,
    callee: {},
    selectedDeclaration: structDeclaration,
    arguments: [],
  }), fakeObservationContext({
    virtualDeclarationSubject: structDeclaration,
    virtualDeclaration: coreLangMarker("struct"),
    structFactSubject: structCall,
    structFact: {
      valueType: true,
      fields: [{
        name: "count",
        type: typeNode,
      }],
    },
  }));

  assert.equal(outResult.kind, "accept", outResult.kind === "reject" ? outResult.diagnostic.message : undefined);
  assert.equal(outResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::out");
  assert.equal(refResult.kind, "accept", refResult.kind === "reject" ? refResult.diagnostic.message : undefined);
  assert.equal(refResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::ref");
  assert.equal(inrefResult.kind, "accept", inrefResult.kind === "reject" ? inrefResult.diagnostic.message : undefined);
  assert.equal(inrefResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::inref");
  assert.equal(defaultResult.kind, "accept", defaultResult.kind === "reject" ? defaultResult.diagnostic.message : undefined);
  assert.equal(defaultResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::defaultof");
  assert.equal(fieldResult.kind, "accept", fieldResult.kind === "reject" ? fieldResult.diagnostic.message : undefined);
  assert.equal(fieldResult.value.selectedSignature.member.id, "source-semantics.field:count");
  assert.equal(structResult.kind, "accept", structResult.kind === "reject" ? structResult.diagnostic.message : undefined);
  assert.equal(structResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::struct");
});
