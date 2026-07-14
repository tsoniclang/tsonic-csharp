import { test, assert, argumentPassingFactKey, attributeFactKey, defaultValueFactKey, deferObservation, fieldFactKey, flowStateFactKey, functionPointerFactKey, pointerFactKey, providerVirtualDeclarationFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetBindingFactKey, csharpTargetOperationFactKey, createCsharpNativeOperationsProvider, selectTargetMember, validateCsharpTargetConstraintFactsBeforeFinalization, csharpNullableValueTargetType, csharpSourcePrimitiveDotnetMetadataName, resolveTargetTypeRefFromSubjectFacts, getNativeSemanticProvider, method, property, field, eventMember, constructorMember, targetParameterWithOptions, unsupportedMember, assertUnsupportedDiagnosticEvidence, indexer, csharpStringType, csharpObjectType, csharpVoidType, csharpReadOnlySpanType, csharpIEnumerableType, overlapExtensionsBinding, overlapMethod, targetParameter, spanType, readOnlySpanType, coreLangMarker, virtualMember, propertyAccessCallee, targetIdFromMemberId, fakeObservationContext } from "./provider-selection.helpers.mjs";

test("C# target resolves source-core ptr and fnptr facts to target type refs", () => {
  const pointerSubject = {};
  const functionPointerSubject = {};
  const int32Subject = {};
  const boolSubject = {};
  const unresolvedPointerSubject = {};
  const unresolvedFunctionPointerSubject = {};
  const facts = new Map();
  const setFact = (subject, key, value) => {
    const subjectFacts = facts.get(subject) ?? new Map();
    subjectFacts.set(key, value);
    facts.set(subject, subjectFacts);
  };
  setFact(int32Subject, sourcePrimitiveFactKey, {
    kind: "int32",
    runtimeBase: "number",
    signed: true,
    width: 32,
  });
  setFact(boolSubject, sourcePrimitiveFactKey, {
    kind: "bool",
    runtimeBase: "boolean",
  });
  setFact(pointerSubject, pointerFactKey, {
    pointee: int32Subject,
    mutability: "target-defined",
    unsafeRequired: true,
  });
  setFact(functionPointerSubject, functionPointerFactKey, {
    parameters: [pointerSubject, int32Subject],
    result: boolSubject,
    abi: ["target-default"],
  });
  setFact(unresolvedPointerSubject, pointerFactKey, {
    pointee: {},
    mutability: "target-defined",
    unsafeRequired: true,
  });
  setFact(unresolvedFunctionPointerSubject, functionPointerFactKey, {
    parameters: [int32Subject],
    result: {},
    abi: ["target-default"],
  });
  const context = {
    facts: {
      get(subject, key) {
        return facts.get(subject)?.get(key);
      },
    },
    factResolver: {
      resolve(subject, key) {
        return facts.get(subject)?.get(key);
      },
    },
  };
  const resolveSubject = (subject) => resolveTargetTypeRefFromSubjectFacts(subject, context, {}, resolveSubject);

  assert.deepEqual(resolveSubject(pointerSubject), {
    kind: "pointer",
    pointee: { kind: "source-primitive", name: "int32" },
    mutability: "target-defined",
  });
  assert.deepEqual(resolveSubject(functionPointerSubject), {
    kind: "function-pointer",
    args: [
      {
        kind: "pointer",
        pointee: { kind: "source-primitive", name: "int32" },
        mutability: "target-defined",
      },
      { kind: "source-primitive", name: "int32" },
    ],
    result: { kind: "source-primitive", name: "bool" },
    abi: ["target-default"],
  });
  assert.equal(resolveSubject(unresolvedPointerSubject), undefined);
  assert.equal(resolveSubject(unresolvedFunctionPointerSubject), undefined);
});
test("C# source primitive provider identity resolves aliases before numeric semantic defaults", () => {
  const typeName = {};
  const context = fakeObservationContext({
    factsBySubject: new Map([
      [typeName, new Map([
        [providerVirtualDeclarationFactKey, {
          providerId: "test",
          providerVersion: "0",
          providerModuleId: "@tsonic/csharp/types.js",
          moduleSpecifier: "@tsonic/csharp/types.js",
          artifactFileName: "tsts-provider://@tsonic/csharp/types.js",
          exportName: "int",
          exportId: "@tsonic/csharp/types.js::int",
        }],
      ])],
    ]),
  });
  const resolveSubject = (subject) => resolveTargetTypeRefFromSubjectFacts(subject, context, {}, resolveSubject);

  assert.deepEqual(resolveSubject(typeName), { kind: "source-primitive", name: "int32" });
});
test("C# attribute builder marker identity comes from finalized attribute facts", () => {
  const provider = getNativeSemanticProvider();
  const call = {};

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
    calleePropertyName: "add",
    arguments: [],
  }, fakeObservationContext({
    attributeSubject: call,
    attribute: {
      target: {},
      attributeName: "RouteAttribute",
      arguments: [],
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "source-semantics.attribute:RouteAttribute");
  assert.equal(result.value.selectedSignature.member.sourceName, "attribute");
});
test("C# provider rejects provider virtual declarations without member or signature identity", () => {
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
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});
test("C# provider rejects checked provider calls without selected provider signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const selectedSignature = {};
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
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedSignature: selectedSignature,
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
    virtualDeclaration: virtualMember("Example.Target.m"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SELECTED_PROVIDER_SIGNATURE_NOT_PROVEN");
});
test("C# provider rejects reused selected provider signatures without argument conversion closure", () => {
  const provider = getNativeSemanticProvider();
  const call = {};
  const int32 = { kind: "source-primitive", name: "int32" };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
    calleePropertyName: "m",
    arguments: [{}],
  }, fakeObservationContext({
    selectedSignatureSubject: call,
    selectedSignature: {
      member: method("Example.Target.m(System.Int32)", int32),
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_ARGUMENT_CONVERSIONS_NOT_PROVEN");
});
test("C# provider rejects reused selected provider signatures with mismatched argument conversions", () => {
  const provider = getNativeSemanticProvider();
  const call = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const int64 = { kind: "source-primitive", name: "int64" };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
    calleePropertyName: "m",
    arguments: [{}],
  }, fakeObservationContext({
    selectedSignatureSubject: call,
    selectedSignature: {
      member: method("Example.Target.m(System.Int32)", int32),
      argumentConversions: [int64],
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_ARGUMENT_CONVERSIONS_MISMATCH");
});
test("C# provider includes virtual declaration signature id as candidate evidence", () => {
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
      signatureId: "Example.Target.m(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});
test("C# provider resolves selected calls from virtual target identity host bindings", () => {
  const selectedDeclaration = {};
  const argument = {};
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
  const provider = getNativeSemanticProvider({ bindings: [binding] });

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.m"),
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : result.kind);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});
test("C# provider maps static-disambiguated provider member identities to canonical target signatures", () => {
  const selectedDeclaration = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }, {
        static: true,
        overloadGroup: "Example.Target.m",
      }),
    ],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.m#static"),
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : result.kind);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});
test("C# provider does not map static-disambiguated identities to instance target members", () => {
  const selectedDeclaration = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }, {
        overloadGroup: "Example.Target.m",
      }),
    ],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.m#static"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});
test("C# provider maps instance-disambiguated provider member identities to canonical instance signatures", () => {
  const selectedDeclaration = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }, {
        overloadGroup: "Example.Target.m",
      }),
    ],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.m#instance"),
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : result.kind);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});
test("C# provider maps calls from the exact selected signature identity before declaration identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const selectedSignature = {};
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
    sourceSelectedSignature: selectedSignature,
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
    virtualDeclaration: virtualMember("Example.Target.m"),
    virtualSignatureSubject: selectedSignature,
    virtualSignatureDeclaration: {
      ...virtualMember("Example.Target.m", "renamed"),
      signatureId: "Example.Target.m(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});
test("C# provider preserves exact selected constructor signatures instead of refining to siblings", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const call = { Kind: "KindNewExpression" };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [
      constructorMember("Example.Target..ctor(System.Int32)", { kind: "source-primitive", name: "int32" }),
      constructorMember("Example.Target..ctor(System.Int64)", { kind: "source-primitive", name: "int64" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
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
      ...virtualMember("Example.Target..ctor", "constructor"),
      signatureId: "Example.Target..ctor(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target..ctor(System.Int64)");
});
test("C# provider selects provider constructors from a selected provider type identity", () => {
  const provider = getNativeSemanticProvider();
  const containerSymbol = {};
  const argument = csharpStringType();
  const binding = {
    id: "Example.Exception",
    sourceName: "Exception",
    targetName: "Exception",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Exception" },
    members: [
      {
        ...constructorMember("Example.Exception..ctor(System.String)", csharpStringType()),
        overloadGroup: "Example.Exception..ctor",
      },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: { Kind: "KindNewExpression" },
    callee: {},
    sourceCalleeSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Exception..ctor(System.String)");
});
test("C# provider selects constructor overloads only within the proven provider constructor group", () => {
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
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [
      constructorMember("Example.Target..ctor(System.Int32)", { kind: "source-primitive", name: "int32" }),
      constructorMember("Example.Target..ctor(System.Int64)", { kind: "source-primitive", name: "int64" }),
      {
        ...constructorMember("Example.Target.OtherConstructor(System.Int32)", { kind: "source-primitive", name: "int32" }),
        overloadGroup: "Example.Target.OtherConstructor",
      },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: { Kind: "KindNewExpression" },
    callee: {},
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
    virtualDeclaration: virtualMember("Example.Target..ctor", "constructor"),
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target..ctor(System.Int64)");
});
