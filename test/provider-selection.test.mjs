import { test, assert, argumentPassingFactKey, attributeFactKey, defaultValueFactKey, deferObservation, fieldFactKey, flowStateFactKey, functionPointerFactKey, pointerFactKey, providerVirtualDeclarationFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetBindingFactKey, csharpTargetOperationFactKey, createCsharpNativeOperationsProvider, selectTargetMember, csharpNullableValueTargetType, csharpSourcePrimitiveDotnetMetadataName, resolveTargetTypeRefFromSubjectFacts, checkedCallRequest, getNativeSemanticProvider, method, property, field, eventMember, constructorMember, targetParameterWithOptions, unsupportedMember, assertUnsupportedDiagnosticEvidence, indexer, csharpStringType, csharpObjectType, csharpVoidType, csharpReadOnlySpanType, csharpIEnumerableType, overlapExtensionsBinding, overlapMethod, targetParameter, spanType, readOnlySpanType, coreLangMarker, virtualMember, propertyAccessCallee, targetIdFromMemberId, fakeObservationContext } from "./provider-selection.helpers.mjs";
import { findTargetMemberForCall } from "../dist/source/csharp-source-semantics/target-member-selection.js";

function exactProviderSourceSelection(signatureId) {
  return {
    sourceSelectionProven: true,
    selectedProviderDeclaration: {
      moduleSpecifier: "@example/native.js",
      exportName: "Target",
      signatureId,
    },
  };
}

test("C# provider rejects ambiguous target members instead of ranking candidates", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const literalArgument = { Kind: 1, Text: "1" };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }, {
        providerSourceSignatureId: "Example.Target.m(source)",
      }),
      method("Example.Target.m(System.Int32Alt)", { kind: "source-primitive", name: "int32" }, {
        providerSourceSignatureId: "Example.Target.m(source)",
      }),
    ],
  };

  const result = provider.mapCheckedCall(checkedCallRequest({
    call: {},
    callee: {},
    selectedDeclaration,
    selectedCalleeSymbol: containerSymbol,
    arguments: [literalArgument],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: literalArgument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.m"),
      signatureId: "Example.Target.m(source)",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});
test("target member selection does not treat System.Object as an implicit wildcard", () => {
  const argument = {};
  const member = method("Example.Target.m(System.Object)", { kind: "target-named", id: "System.Object" });
  const context = {};
  const resolveTargetTypeRef = (subject) => subject === argument
    ? { kind: "source-primitive", name: "int32" }
    : undefined;

  assert.equal(
    selectTargetMember([member], { arguments: [{ subject: argument }] }, context, resolveTargetTypeRef),
    undefined,
  );
});
test("target member selection accepts source-checked object parameters only from exact checked signatures", () => {
  const argument = {};
  const member = {
    ...method("Example.Target.m(System.Object)", { kind: "target-named", id: "System.Object" }),
    parameters: [{
      name: "value",
      type: { kind: "target-named", id: "System.Object" },
      passingMode: "by-value",
      csharpAcceptsCheckedSourceArgument: true,
    }],
  };
  const context = {};
  const resolveTargetTypeRef = () => undefined;

  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [{ subject: argument }], ...exactProviderSourceSelection(member.id) },
      context,
      resolveTargetTypeRef,
    )?.id,
    member.id,
  );
  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [{ subject: argument }] },
      context,
      resolveTargetTypeRef,
    ),
    undefined,
  );
});
test("target member selection lets exact checked signatures prove source-projected callback parameters over target-resolved arguments", () => {
  const argument = {};
  const member = {
    ...method("Example.Task.ContinueWith``1(System.Func`3,System.Object)", { kind: "target-named", id: "System.Func`3" }),
    parameters: [{
      name: "continuation",
      type: { kind: "target-named", id: "System.Func`3" },
      passingMode: "by-value",
      csharpAcceptsCheckedSourceArgument: true,
    }],
  };
  const context = {};
  const resolveTargetTypeRef = () => ({ kind: "target-named", id: "Tsonic.Generated.Callback" });

  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [{ subject: argument }], ...exactProviderSourceSelection(member.id) },
      context,
      resolveTargetTypeRef,
    )?.id,
    member.id,
  );
  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [{ subject: argument }] },
      context,
      resolveTargetTypeRef,
    ),
    undefined,
  );
});
test("target member selection lets exact source-profile identities prove source-projected callback parameters", () => {
  const argument = {};
  const sourceIdentity = "Promise.constructor";
  const member = {
    ...method("Tsonic.CSharp.Js.PromiseRuntime.Create", { kind: "target-named", id: "Tsonic.CSharp.Js.PromiseExecutor" }),
    sourceIdentityKeys: [sourceIdentity],
    parameters: [{
      name: "executor",
      type: { kind: "target-named", id: "Tsonic.CSharp.Js.PromiseExecutor" },
      passingMode: "by-value",
      csharpAcceptsCheckedSourceArgument: true,
    }],
  };
  const context = {};
  const resolveTargetTypeRef = () => ({ kind: "target-named", id: "System.Action" });

  assert.equal(
    selectTargetMember(
      [member],
      {
        arguments: [{ subject: argument }],
        sourceSelectionProven: true,
        sourceSelectedIdentity: sourceIdentity,
      },
      context,
      resolveTargetTypeRef,
    )?.id,
    member.id,
  );
  assert.equal(
    selectTargetMember(
      [member],
      {
        arguments: [{ subject: argument }],
        sourceSelectionProven: true,
        sourceSelectedIdentity: "Promise.then",
      },
      context,
      resolveTargetTypeRef,
    ),
    undefined,
  );
});
test("target member selection accepts source-primitive parameters only from exact checked source signatures", () => {
  const argument = {};
  const member = method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" });
  const context = {};
  const resolveTargetTypeRef = () => undefined;

  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [{ subject: argument }], ...exactProviderSourceSelection(member.id) },
      context,
      resolveTargetTypeRef,
    )?.id,
    member.id,
  );
  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [{ subject: argument }] },
      context,
      resolveTargetTypeRef,
    ),
    undefined,
  );
});
test("target member selection lets exact checked source signatures prove source-primitive parameters over target-resolved arguments", () => {
  const argument = {};
  const member = method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" });
  const context = {};
  const resolveTargetTypeRef = () => ({ kind: "target-named", id: "System.Int32" });

  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [{ subject: argument }], ...exactProviderSourceSelection(member.id) },
      context,
      resolveTargetTypeRef,
    )?.id,
    member.id,
  );
  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [{ subject: argument }] },
      context,
      resolveTargetTypeRef,
    ),
    undefined,
  );
});
test("target member selection uses source marker target expression for byref parameters", () => {
  const key = {};
  const outCall = {};
  const value = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      targetParameter("value", int32, "byref-writeonly-must-init"),
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const context = fakeObservationContext({
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: value,
    },
  });
  const resolveTargetTypeRef = (subject) => {
    if (subject === key) {
      return csharpStringType();
    }
    if (subject === value) {
      return int32;
    }
    return undefined;
  };

  assert.equal(
    selectTargetMember([member], { arguments: [{ subject: key }, { subject: outCall }] }, context, resolveTargetTypeRef)?.id,
    member.id,
  );
});
test("target member selection rejects byref parameters without source marker facts", () => {
  const key = {};
  const outCall = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      targetParameter("value", int32, "byref-writeonly-must-init"),
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const resolveTargetTypeRef = (subject) => subject === key ? csharpStringType() : int32;

  assert.equal(
    selectTargetMember([member], { arguments: [{ subject: key }, { subject: outCall }] }, fakeObservationContext({}), resolveTargetTypeRef),
    undefined,
  );
});
test("target member selection rejects byref parameter mode mismatches", () => {
  const key = {};
  const outCall = {};
  const value = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      targetParameter("value", int32, "byref-writeonly-must-init"),
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const context = fakeObservationContext({
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-readwrite",
      targetExpression: value,
    },
  });
  const resolveTargetTypeRef = (subject) => subject === key ? csharpStringType() : int32;

  assert.equal(
    selectTargetMember([member], { arguments: [{ subject: key }, { subject: outCall }] }, context, resolveTargetTypeRef),
    undefined,
  );
});
test("target member selection accepts canonical source-marker passing facts for matching byref parameters", () => {
  const key = {};
  const outCall = {};
  const value = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const outParameter = targetParameter("value", int32, "byref-writeonly-must-init");
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      outParameter,
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const context = fakeObservationContext({
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: value,
    },
  });
  const resolveTargetTypeRef = (subject) => {
    if (subject === key) {
      return csharpStringType();
    }
    if (subject === value) {
      return int32;
    }
    return undefined;
  };

  assert.equal(selectTargetMember(
    [member],
    { arguments: [{ subject: key }, { subject: outCall }] },
    context,
    resolveTargetTypeRef,
  )?.id, member.id);
});
test("C# provider keeps source-core argument-passing facts canonical", () => {
  const provider = getNativeSemanticProvider();

  assert.equal(provider.resolveParameterPassing, undefined);
});
test("C# parameter-passing validation rejects selected byref members without source marker facts", () => {
  const provider = getNativeSemanticProvider();
  const argument = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const selectedDeclaration = {};
  const containerSymbol = {};
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      targetParameter("value", int32, "byref-writeonly-must-init"),
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };

  const result = provider.mapCheckedCall(checkedCallRequest({
    call: {},
    callee: {},
    selectedDeclaration,
    selectedCalleeSymbol: containerSymbol,
    arguments: [{ kind: "target-named", id: "System.String" }, argument],
  }), fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: {
      id: "Example.Target",
      sourceName: "Target",
      targetName: "Target",
      target: "csharp",
      kind: "class",
      members: [member],
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.tryGetValue", "tryGetValue"),
      signatureId: member.id,
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});
test("C# provider does not refine exact selected byref call signatures to by-value siblings", () => {
  const provider = getNativeSemanticProvider();
  const argument = {};
  const int32 = { kind: "source-primitive", name: "int32" };
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
      method("Example.Target.update(System.Int32)", int32, {
        sourceName: "update",
        targetName: "Update",
        overloadGroup: "Example.Target.update",
      }),
      {
        ...method("Example.Target.update(ref System.Int32)", int32, {
          sourceName: "update",
          targetName: "Update",
          overloadGroup: "Example.Target.update",
        }),
        parameters: [targetParameter("value", int32, "byref-readwrite")],
      },
    ],
  };

  const result = provider.mapCheckedCall(checkedCallRequest({
    call: {},
    callee: {},
    selectedDeclaration,
    selectedCalleeSymbol: containerSymbol,
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
      ...virtualMember("Example.Target.update", "update"),
      signatureId: "Example.Target.update(ref System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});
test("C# provider rejects missing or mutated target parameter-mode facts before recording selected operations", () => {
  const provider = getNativeSemanticProvider();
  const int32 = { kind: "source-primitive", name: "int32" };
  const outCall = {};
  const value = int32;
  const scenarios = [
    {
      name: "missing omitted optional passing mode",
      arguments: [],
      member: {
        ...method("Example.Target.missing(System.String)", csharpStringType(), {
          sourceName: "missing",
          targetName: "Missing",
          overloadGroup: "Example.Target.missing",
        }),
        parameters: [{
          name: "notNamedOptional",
          type: csharpStringType(),
          optional: true,
          defaultValue: { kind: "string", value: "proved" },
        }],
      },
    },
    {
      name: "mutated noncanonical passing mode",
      arguments: [outCall],
      context: {
        argumentPassingSubject: outCall,
        argumentPassing: {
          mode: "out",
          targetExpression: value,
        },
      },
      member: {
        ...method("Example.Target.mutated(out System.Int32)", int32, {
          sourceName: "mutated",
          targetName: "Mutated",
          overloadGroup: "Example.Target.mutated",
        }),
        parameters: [{
          name: "notNamedOut",
          type: int32,
          passingMode: "out",
        }],
      },
    },
  ];

  for (const scenario of scenarios) {
    const selectedDeclaration = {};
    const containerSymbol = {};
    const recordedFacts = [];
    const result = provider.mapCheckedCall(checkedCallRequest({
      call: {},
      callee: {},
      selectedDeclaration,
      selectedCalleeSymbol: containerSymbol,
      arguments: scenario.arguments,
    }), fakeObservationContext({
      ...scenario.context,
      targetBindingSubject: containerSymbol,
      targetBinding: {
        id: "Example.Target",
        sourceName: "Target",
        targetName: "Target",
        target: "csharp",
        kind: "class",
        members: [scenario.member],
      },
      virtualDeclarationSubject: selectedDeclaration,
      virtualDeclaration: {
        ...virtualMember(scenario.member.overloadGroup, scenario.member.sourceName),
        signatureId: scenario.member.id,
      },
      recordedFacts,
    }));

    assert.equal(result.kind, "reject", scenario.name);
    assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND", scenario.name);
    assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false, scenario.name);
  }
});
test("target member selection rejects source marker wrappers for by-value parameters", () => {
  const outCall = {};
  const value = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = method("Example.Target.m(System.Int32)", int32);
  const context = fakeObservationContext({
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: value,
    },
  });
  const resolveTargetTypeRef = (subject) => subject === value ? int32 : undefined;

  assert.equal(
    selectTargetMember([member], { arguments: [{ subject: outCall }] }, context, resolveTargetTypeRef),
    undefined,
  );
});
test("C# provider validates generic constraints only from finalized target facts", () => {
  const provider = getNativeSemanticProvider({
    bindings: [
      {
        id: "Example.Widget",
        sourceName: "Widget",
        targetName: "Widget",
        target: "csharp",
        kind: "class",
        implementedContracts: [{
          kind: "implements",
          contract: "Example.ITagged",
        }],
        members: [{
          id: "Example.Widget..ctor()",
          sourceName: "constructor",
          targetName: ".ctor",
          kind: "constructor",
          parameters: [],
          returnType: { kind: "target-named", id: "Example.Widget" },
        }],
      },
      {
        id: "Example.StructValue",
        sourceName: "StructValue",
        targetName: "StructValue",
        target: "csharp",
        kind: "struct",
      },
    ],
  });

  const widget = { kind: "target-named", id: "Example.Widget" };
  const structValue = { kind: "target-named", id: "Example.StructValue" };
  const widgetArray = { kind: "array", element: widget };
  const sourceClass = { kind: "target-named", id: "SourceClass", csharpSourceDeclarationKind: "class" };
  const sourceInterface = { kind: "target-named", id: "SourceInterface", csharpSourceDeclarationKind: "interface" };
  const sourceStruct = { kind: "target-named", id: "SourceStruct", csharpSourceDeclarationKind: "struct" };

  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widgetArray,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: sourceClass,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: sourceInterface,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: sourceStruct,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({})).kind, "reject");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: structValue,
    constraint: { kind: "value-type" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "constructible" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "implements", contract: "Example.ITagged" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "target-specific", target: "csharp", name: "notnull" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: structValue,
    constraint: { kind: "target-specific", target: "csharp", name: "notnull" },
  }, fakeObservationContext({})).kind, "accept");
});
test("C# provider rejects generic constraints without finalized target proof", () => {
  const provider = getNativeSemanticProvider({
    bindings: [{
      id: "Example.Widget",
      sourceName: "Widget",
      targetName: "Widget",
      target: "csharp",
      kind: "class",
    }],
  });
  const widget = { kind: "target-named", id: "Example.Widget" };
  const unknown = { kind: "target-named", id: "Example.Unknown" };

  const missingContract = provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "implements", contract: "Example.ITagged" },
  }, fakeObservationContext({}));
  assert.equal(missingContract.kind, "reject");
  assert.equal(missingContract.diagnostic.extensionCode, "CSHARP_TARGET_CONSTRAINT_INVALID");

  const missingBinding = provider.validateTargetConstraint({
    target: "csharp",
    source: unknown,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({}));
  assert.equal(missingBinding.kind, "reject");

  const unsupportedConstraint = provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "target-specific", target: "rust", name: "Send" },
  }, fakeObservationContext({}));
  assert.equal(unsupportedConstraint.kind, "reject");

  const unsupportedTargetConstraint = provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: {
      kind: "unsupported",
      target: "csharp",
      id: "Example.PointerContract",
      reason: "Constraint uses a provider type-ref that is not representable.",
    },
  }, fakeObservationContext({}));
  assert.equal(unsupportedTargetConstraint.kind, "reject");
  assert.match(unsupportedTargetConstraint.diagnostic.message, /not supported by the C# target provider/u);

  const nullableValue = provider.validateTargetConstraint({
    target: "csharp",
    source: csharpNullableValueTargetType({ kind: "source-primitive", name: "int32" }),
    constraint: { kind: "target-specific", target: "csharp", name: "notnull" },
  }, fakeObservationContext({}));
  assert.equal(nullableValue.kind, "reject");
  assert.equal(nullableValue.diagnostic.extensionCode, "CSHARP_TARGET_CONSTRAINT_INVALID");
});
test("C# provider validates source primitive generic constraints from reflected primitive contract facts", () => {
  const int32 = { kind: "source-primitive", name: "int32" };
  const int64 = { kind: "source-primitive", name: "int64" };
  const int32Binding = {
    id: "System.Int32",
    sourceName: "Int32",
    targetName: "Int32",
    target: "csharp",
    kind: "struct",
    implementedContracts: [{
      kind: "implements",
      contract: "System.IEquatable`1",
      typeArguments: [int32],
    }],
  };
  const provider = getNativeSemanticProvider({
    bindings: [int32Binding],
    metadataBindings: [[csharpSourcePrimitiveDotnetMetadataName("int32"), int32Binding]],
  });

  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: int32,
    constraint: { kind: "implements", contract: "System.IEquatable`1", typeArguments: [int32] },
  }, fakeObservationContext({})).kind, "accept");

  const mismatchedArgument = provider.validateTargetConstraint({
    target: "csharp",
    source: int32,
    constraint: { kind: "implements", contract: "System.IEquatable`1", typeArguments: [int64] },
  }, fakeObservationContext({}));
  assert.equal(mismatchedArgument.kind, "reject");

  const missingArgument = provider.validateTargetConstraint({
    target: "csharp",
    source: int32,
    constraint: { kind: "implements", contract: "System.IEquatable`1" },
  }, fakeObservationContext({}));
  assert.equal(missingArgument.kind, "reject");
});
test("C# provider selects from a proven provider binding using checked source member and target argument facts", () => {
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

  const result = provider.mapCheckedCall(checkedCallRequest({
    call: {},
    callee: {},
    selectedDeclaration,
    selectedCalleeSymbol: containerSymbol,
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
      ...virtualMember("Example.Target.m"),
      signatureId: "Example.Target.m(System.Int32)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});

test("provider member selection distinguishes same-spelling static and instance members by exact identity", () => {
  // class Example { static Equals(value: string): boolean; Equals(value: string): boolean; }
  // Both members share a target id and spelling; only the provider member
  // identity plus ProviderDeclarationIdentity.memberStatic separates them.
  const argument = {};
  const staticSignatureId = "Example.Equals(System.String)";
  const instanceSignatureId = "Example.Equals(System.String)$instance";
  const binding = {
    target: "csharp",
    id: "Example",
    kind: "class",
    members: [
      {
        id: staticSignatureId,
        providerMemberId: "Example.Equals#static",
        sourceName: "Equals",
        targetName: "Equals",
        kind: "method",
        static: true,
        overloadGroup: "Example.Equals",
        parameters: [{ name: "value", type: csharpStringType(), passingMode: "by-value" }],
        returnType: { kind: "source-primitive", name: "bool" },
      },
      {
        id: instanceSignatureId,
        providerMemberId: "Example.Equals#instance",
        sourceName: "Equals",
        targetName: "Equals",
        kind: "method",
        overloadGroup: "Example.Equals",
        parameters: [{ name: "value", type: csharpStringType(), passingMode: "by-value" }],
        returnType: { kind: "source-primitive", name: "bool" },
      },
    ],
  };
  const resolveTargetTypeRef = (subject) => subject === argument ? csharpStringType() : undefined;
  const select = (memberId, memberStatic) => findTargetMemberForCall(
    binding,
    { moduleSpecifier: "@example/x.js", exportName: "Example", memberId, memberStatic, memberName: "Equals" },
    checkedCallRequest({ target: "csharp", call: {}, callee: {}, arguments: [argument] }),
    fakeObservationContext({}),
    resolveTargetTypeRef,
    { firstArgumentReceiver: false },
  );

  assert.equal(select("Example.Equals#static", true)?.id, staticSignatureId);
  assert.equal(select("Example.Equals#instance", false)?.id, instanceSignatureId);
});

test("provider member selection fails closed when selected staticness contradicts the target member", () => {
  const argument = {};
  const binding = {
    target: "csharp",
    id: "Example",
    kind: "class",
    members: [{
      id: "Example.Equals(System.String)",
      providerMemberId: "Example.Equals#static",
      sourceName: "Equals",
      targetName: "Equals",
      kind: "method",
      static: true,
      overloadGroup: "Example.Equals",
      parameters: [{ name: "value", type: csharpStringType(), passingMode: "by-value" }],
      returnType: { kind: "source-primitive", name: "bool" },
    }],
  };

  assert.equal(
    findTargetMemberForCall(
      binding,
      // Contradictory: the identity names the static member, memberStatic says instance.
      { moduleSpecifier: "@example/x.js", exportName: "Example", memberId: "Example.Equals#static", memberStatic: false, memberName: "Equals" },
      checkedCallRequest({ target: "csharp", call: {}, callee: {}, arguments: [argument] }),
      fakeObservationContext({}),
      (subject) => subject === argument ? csharpStringType() : undefined,
      { firstArgumentReceiver: false },
    ),
    undefined,
  );
});
