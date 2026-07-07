import { test, assert, argumentPassingFactKey, attributeFactKey, defaultValueFactKey, deferObservation, fieldFactKey, flowStateFactKey, functionPointerFactKey, pointerFactKey, providerVirtualDeclarationFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetBindingFactKey, csharpTargetOperationFactKey, createCsharpNativeOperationsProvider, selectTargetMember, validateCsharpTargetConstraintFactsBeforeFinalization, csharpNullableValueTargetType, csharpSourcePrimitiveDotnetMetadataName, resolveTargetTypeRefFromSubjectFacts, getNativeSemanticProvider, method, property, field, eventMember, constructorMember, targetParameterWithOptions, unsupportedMember, assertUnsupportedDiagnosticEvidence, indexer, csharpStringType, csharpObjectType, csharpVoidType, csharpReadOnlySpanType, csharpIEnumerableType, overlapExtensionsBinding, overlapMethod, targetParameter, spanType, readOnlySpanType, coreLangMarker, virtualMember, propertyAccessCallee, targetIdFromMemberId, fakeObservationContext } from "./provider-selection.helpers.mjs";

test("target member selection binds first-argument receiver generics before explicit arguments", () => {
  const receiver = {};
  const validArgument = {};
  const invalidArgument = {};
  const int32Type = { kind: "source-primitive", name: "int32" };
  const stringType = { kind: "target-named", id: "System.String" };
  const member = {
    id: "Tsonic.CSharp.Runtime.ArrayHelpers.includes",
    sourceName: "includes",
    targetName: "Includes",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    parameters: [
      {
        name: "array",
        type: { kind: "array", element: { kind: "type-parameter", name: "T" } },
        passingMode: "by-value",
      },
      {
        name: "value",
        type: { kind: "type-parameter", name: "T" },
        passingMode: "by-value",
      },
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const context = {};
  const resolveTargetTypeRef = (subject) => {
    if (subject === receiver) {
      return { kind: "array", element: int32Type };
    }
    if (subject === validArgument) {
      return int32Type;
    }
    if (subject === invalidArgument) {
      return stringType;
    }
    return undefined;
  };

  assert.deepEqual(
    selectTargetMember([member], { arguments: [validArgument], receiver }, context, resolveTargetTypeRef),
    {
      ...member,
      parameters: [
        {
          ...member.parameters[0],
          type: { kind: "array", element: int32Type },
        },
        {
          ...member.parameters[1],
          type: int32Type,
        },
      ],
    },
  );
  assert.equal(
    selectTargetMember([member], { arguments: [invalidArgument], receiver }, context, resolveTargetTypeRef),
    undefined,
  );
  assert.equal(
    selectTargetMember([member], { arguments: [validArgument] }, context, resolveTargetTypeRef),
    undefined,
  );
});
test("target member selection does not prepend provider static container for explicit extension calls", () => {
  const staticContainer = {};
  const value = {};
  const start = {};
  const stringType = csharpStringType();
  const int32Type = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "System.MemoryExtensions.AsSpan(System.String,System.Int32)",
    sourceName: "asSpan",
    targetName: "AsSpan",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    parameters: [
      {
        name: "text",
        type: stringType,
        passingMode: "by-value",
      },
      {
        name: "start",
        type: int32Type,
        passingMode: "by-value",
      },
    ],
    returnType: csharpReadOnlySpanType({ kind: "source-primitive", name: "char" }),
  };
  const context = {};
  const resolveTargetTypeRef = (subject) => {
    if (subject === staticContainer) {
      return { kind: "target-named", id: "System.MemoryExtensions" };
    }
    if (subject === value) {
      return stringType;
    }
    if (subject === start) {
      return int32Type;
    }
    return undefined;
  };

  assert.equal(
    selectTargetMember([member], { arguments: [value, start], receiver: staticContainer }, context, resolveTargetTypeRef),
    undefined,
  );
  assert.deepEqual(
    selectTargetMember([member], { arguments: [value, start], receiver: staticContainer }, context, resolveTargetTypeRef, { firstArgumentReceiver: false }),
    member,
  );
});
test("C# provider maps extension receiver calls from selected provider signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const call = {};
  const receiver = { Kind: "KindIdentifier", Text: "text", ...csharpStringType() };
  const start = { kind: "source-primitive", name: "int32" };
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: propertyAccessCallee(receiver, "asSpan"),
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [start],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: {
      id: "System.MemoryExtensions",
      sourceName: "MemoryExtensions",
      targetName: "System.MemoryExtensions",
      target: "csharp",
      kind: "class",
      members: [
        {
          id: "System.MemoryExtensions.AsSpan(System.String,System.Int32)",
          sourceName: "asSpan",
          targetName: "AsSpan",
          kind: "method",
          static: true,
          receiverPassing: "first-argument",
          parameters: [
            targetParameter("text", csharpStringType()),
            targetParameter("start", start),
          ],
          returnType: csharpReadOnlySpanType({ kind: "source-primitive", name: "char" }),
          overloadGroup: "System.MemoryExtensions.AsSpan",
        },
      ],
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("System.MemoryExtensions.AsSpan", "asSpan"),
      signatureId: "System.MemoryExtensions.AsSpan(System.String,System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "System.MemoryExtensions.AsSpan(System.String,System.Int32)");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.operationId, "System.MemoryExtensions.AsSpan(System.String,System.Int32)");
  assert.equal(operation?.selectedMember?.receiverPassing, "first-argument");
});
test("C# provider maps LINQ ExtensionMethods receiver calls from selected signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const call = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const receiver = { Kind: "KindIdentifier", Text: "values", kind: "array", element: int32 };
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: propertyAccessCallee(receiver, "average"),
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: {
      id: "System.Linq.Enumerable",
      sourceName: "ExtensionMethods",
      targetName: "System.Linq.Enumerable",
      target: "csharp",
      kind: "class",
      members: [
        {
          id: "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)",
          sourceName: "average",
          targetName: "Average",
          kind: "method",
          static: true,
          receiverPassing: "first-argument",
          parameters: [
            targetParameter("source", csharpIEnumerableType(int32)),
          ],
          returnType: { kind: "source-primitive", name: "float64" },
          overloadGroup: "System.Linq.Enumerable.Average",
        },
      ],
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("System.Linq.Enumerable.Average", "average"),
      signatureId: "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.deepEqual(result.value.selectedSignature.member.returnType, { kind: "source-primitive", name: "float64" });

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.operationId, "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)");
  assert.equal(operation?.memberName, "Average");
  assert.equal(operation?.static, true);
  assert.equal(operation?.selectedMember?.receiverPassing, "first-argument");
});
test("C# provider maps overlap-style extension overloads with receiver and out parameter facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const call = {};
  const outCall = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const receiver = { Kind: "KindIdentifier", Text: "span", ...spanType(int32) };
  const other = readOnlySpanType(int32);
  const offset = int32;
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: propertyAccessCallee(receiver, "overlaps"),
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [other, outCall],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: overlapExtensionsBinding(),
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.MemoryExtensions.Overlaps", "overlaps"),
      signatureId: "Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)",
    },
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: offset,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.parameters[1]?.passingMode, "byref-writeonly-must-init");

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.selectedMember?.receiverPassing, "first-argument");
  assert.equal(operation?.selectedMember?.parameters[2]?.passingMode, "byref-writeonly-must-init");
});
test("C# provider rejects receiver calls when static target metadata omits receiver passing", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const receiver = { Kind: "KindIdentifier", Text: "value" };
  const binding = {
    id: "Example.Extensions",
    sourceName: "Extensions",
    targetName: "Extensions",
    target: "csharp",
    kind: "class",
    members: [
      {
        id: "Example.Extensions.current",
        sourceName: "current",
        targetName: "Current",
        kind: "method",
        static: true,
        parameters: [],
        returnType: { kind: "source-primitive", name: "bool" },
        overloadGroup: "Example.Extensions.current",
      },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: propertyAccessCallee(receiver, "current"),
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Extensions.current", "current"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_EXTENSION_RECEIVER_NOT_PROVEN");
});
test("target member selection applies declaring generics before literal collection matching", () => {
  const arrayLiteral = { Kind: 2, Elements: [{ Kind: 1, Text: "1" }, { Kind: 1, Text: "2" }] };
  const int32Type = { kind: "source-primitive", name: "int32" };
  const float64ArrayType = { kind: "array", element: { kind: "source-primitive", name: "float64" } };
  const member = {
    id: "System.Collections.Generic.List`1..ctor(System.Collections.Generic.IEnumerable`1<T>)",
    sourceName: "constructor",
    targetName: "constructor",
    kind: "constructor",
    parameters: [{
      name: "collection",
      type: {
        kind: "target-named",
        id: "System.Collections.Generic.IEnumerable`1",
        typeArguments: [{ kind: "type-parameter", name: "T" }],
        csharpArrayLiteralElementType: { kind: "type-parameter", name: "T" },
      },
      passingMode: "by-value",
    }],
    overloadGroup: "System.Collections.Generic.List`1..ctor",
  };
  const context = {
    compiler: {
      ast: {
        kindName: (node) => node?.Kind === 2 ? "KindArrayLiteralExpression" : node?.Kind === 1 ? "KindNumericLiteral" : "Unknown",
        elements: (node) => node.Elements ?? [],
        text: (node) => node.Text ?? "",
        is: {
          IsStringLiteral: () => false,
        },
      },
    },
  };
  const resolveTargetTypeRef = (subject) => subject === arrayLiteral ? float64ArrayType : undefined;

  assert.deepEqual(
    selectTargetMember(
      [member],
      { arguments: [arrayLiteral] },
      context,
      resolveTargetTypeRef,
      {
        declaringTargetType: {
          kind: "target-named",
          id: "System.Collections.Generic.List`1",
          typeArguments: [int32Type],
        },
        declaringTypeParameters: [{ name: "T" }],
      },
    ),
    {
      ...member,
      parameters: [{
        ...member.parameters[0],
        type: {
          kind: "target-named",
          id: "System.Collections.Generic.IEnumerable`1",
          typeArguments: [int32Type],
          csharpArrayLiteralElementType: int32Type,
        },
      }],
    },
  );
});
test("target member selection rejects collection literal matching without provider metadata", () => {
  const arrayLiteral = { Kind: 2, Elements: [{ Kind: 1, Text: "1" }] };
  const int32Type = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "System.Collections.Generic.List`1..ctor(System.Collections.Generic.IEnumerable`1<T>)",
    sourceName: "constructor",
    targetName: "constructor",
    kind: "constructor",
    parameters: [{
      name: "collection",
      type: {
        kind: "target-named",
        id: "System.Collections.Generic.IEnumerable`1",
        typeArguments: [{ kind: "type-parameter", name: "T" }],
      },
      passingMode: "by-value",
    }],
  };
  const context = {
    compiler: {
      ast: {
        kindName: (node) => node?.Kind === 2 ? "KindArrayLiteralExpression" : node?.Kind === 1 ? "KindNumericLiteral" : "Unknown",
        elements: (node) => node.Elements ?? [],
        text: (node) => node.Text ?? "",
        is: {
          IsStringLiteral: () => false,
        },
      },
    },
  };
  const resolveTargetTypeRef = (subject) => subject === arrayLiteral
    ? { kind: "array", element: int32Type }
    : undefined;

  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [arrayLiteral] },
      context,
      resolveTargetTypeRef,
      {
        declaringTargetType: {
          kind: "target-named",
          id: "System.Collections.Generic.List`1",
          typeArguments: [int32Type],
        },
        declaringTypeParameters: [{ name: "T" }],
      },
    ),
    undefined,
  );
});
test("target member selection does not treat opaque any or unknown as wildcard target types", () => {
  const argument = {};
  const int32Type = { kind: "source-primitive", name: "int32" };
  const context = {};
  const resolveTargetTypeRef = (subject) => subject === argument ? int32Type : undefined;

  for (const typeId of ["any", "unknown"]) {
    const member = method(`Example.Target.${typeId}`, { kind: "opaque", id: typeId });
    assert.equal(
      selectTargetMember([member], { arguments: [argument] }, context, resolveTargetTypeRef),
      undefined,
    );
  }
});