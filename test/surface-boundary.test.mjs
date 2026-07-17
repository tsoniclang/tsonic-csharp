import { test, assert, createCompilerSessionFromFiles, formatDiagnostics, providerVirtualDeclarationFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, targetOperationFactKey, createTsonicCoreSourceExtension, csharpArrayBoundaryFactKey, csharpSourceReturnCarrierFactKey, csharpTargetIterationFactKey, csharpTargetMutationOperationFactKey, csharpTargetOperationFactKey, createCsharpJsSurfaceExtension, createCsharpSourceSemanticsExtension, createCsharpTargetSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, planArrayLiteralExpressionWithCarrier, createCsharpNativeOperationsProvider, createProductCsharpJsSurfaceOperationsProvider, mapCsharpJsSurfaceCheckedIteration, csharpJsMapCollectionPolicy, csharpJsSetCollectionPolicy, createCsharpJsSurfaceOperationsProvider, arrayLengthRequest, arrayLengthDeclaration, arrayMemberDeclaration, arrayConstructorDeclaration, sourceLibraryMemberDeclaration, namespaceImportSourceFile, fakeNamespaceImportContext, sourceLibraryPropertyRequest, fakeNodeSubject, fakeHost, fakeContext, fakeAstIs, createCsharpSession, sourceProfileFiles, declarationFiles, fakeTargetPack, collectNodesByKind, collectFactValues, collectAllNodes, jsCallRequest, jsCallRequestWithoutSignature, fakeCallCallee, selectedSourceLibrarySignature, nodejsCallRequest, nodejsCallRequestWithoutSignature, nodejsPropertyRequest, nodejsVirtualDeclaration, nodejsVirtualMemberDeclaration, int32Type, float64Type, boolType, nullishType, stringType, regexpType, dateType, jsObjectType, tsValueType, jsArrayType, jsMapType, jsSetType, int32ArrayType, int32EnumerableType, int32ReadOnlyListType, genericSystemCollectionType, recordDictionaryType, surfaceObjectShapeFact, dictionaryBinding, actionOfInt32Type, funcInt32ToStringType, TestFactStore } from "./surface-boundary.helpers.mjs";

test("Array.length is rejected without the JS surface", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpNativeOperationsProvider(fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, arrayLengthDeclaration()), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NATIVE_ARRAY_PROPERTY_NOT_SUPPORTED");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps Array.length only from the selected Tsonic JS source-profile declaration", () => {
  const expression = {};
  const receiver = fakeNodeSubject({});
  const receiverType = {};
  receiver.SemanticType = receiverType;
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, { carrier: int32ReadOnlyListType() });
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, arrayLengthDeclaration(), { receiver }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps property access from sourceSelectedSymbol before declaration fallback", () => {
  const expression = {};
  const receiver = fakeNodeSubject({});
  const receiverType = {};
  receiver.SemanticType = receiverType;
  const selectedDeclaration = sourceLibraryMemberDeclaration("String", "length");
  const sourceSelectedSymbol = {
    Flags: 0,
    Name: "length",
    declarations: [selectedDeclaration],
  };
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, stringType()],
    [receiverType, stringType()],
  ])));

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver,
    receiverType,
    propertyName: "not-the-selected-name",
    sourceSelectedSymbol,
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "System.String.Length");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "System.String.Length");
});
test("native provider defers unowned JS calls and rejects unmapped JS property operations", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNativeOperationsProvider(fakeHost(undefined));
  const objectCall = {};
  const jsonCall = {};
  const consoleExpression = {};

  const objectResult = provider.mapCheckedCall(jsCallRequest(objectCall, sourceLibraryMemberDeclaration("ObjectConstructor", "keys")), fakeContext(facts));
  const jsonResult = provider.mapCheckedCall(jsCallRequest(jsonCall, sourceLibraryMemberDeclaration("JSON", "parse")), fakeContext(facts));
  const consoleResult = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(consoleExpression, sourceLibraryMemberDeclaration("Console", "log"), "log"), fakeContext(facts));

  assert.equal(objectResult.kind, "defer");
  assert.equal(jsonResult.kind, "defer");
  assert.equal(consoleResult.kind, "reject");
  assert.equal(facts.get(objectCall, csharpTargetOperationFactKey), undefined);
  assert.equal(facts.get(jsonCall, csharpTargetOperationFactKey), undefined);
  assert.equal(facts.get(jsonCall, runtimeCarrierFactKey), undefined);
  assert.equal(facts.get(consoleExpression, csharpTargetOperationFactKey), undefined);
});
test("JS surface defers Array.length from receiver carrier without selected declaration", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, undefined), fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface defers Array.length without selected declaration and finalized receiver carrier", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, undefined), fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface returns deferred Array.length operation before finalized array receiver facts exist", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, arrayLengthDeclaration()), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface attributes array element diagnostics to the selected surface operation provider", () => {
  const expression = {};
  const receiver = {};
  const receiverType = {};
  const index = fakeNodeSubject({});
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, { carrier: int32ReadOnlyListType() });
  const targetTypes = new Map([
    [receiverType, int32ReadOnlyListType()],
    [index, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression,
    receiver,
    receiverType,
    argument: index,
    sourceSelectedDeclaration: arrayMemberDeclaration("at"),
  }, fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionId, "tsonic.csharp.surface.js");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NON_INTEGRAL_ARRAY_INDEX");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface attributes string element diagnostics to the selected surface operation provider", () => {
  const expression = {};
  const receiver = fakeNodeSubject({});
  const receiverType = {};
  receiver.SemanticType = receiverType;
  const index = fakeNodeSubject({});
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, { carrier: stringType() });
  const targetTypes = new Map([
    [receiverType, stringType()],
    [index, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression,
    receiver,
    receiverType,
    argument: index,
    sourceSelectedDeclaration: sourceLibraryMemberDeclaration("String", "charAt"),
  }, fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionId, "tsonic.csharp.surface.js");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NON_INTEGRAL_STRING_INDEX");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps array element access from selected source evidence", () => {
  const expression = {};
  const receiver = fakeNodeSubject({});
  const index = fakeNodeSubject({});
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, { carrier: int32ReadOnlyListType() });
  const targetTypes = new Map([
    [index, int32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression,
    receiver,
    argument: index,
    sourceSelectedDeclaration: arrayMemberDeclaration("at"),
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.array.indexer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.js.array.indexer");
});
test("JS surface closes array element access from selected result evidence before receiver carrier finalization", () => {
  const expression = {};
  const receiver = fakeNodeSubject({});
  const index = fakeNodeSubject({});
  const sourceResultType = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [index, int32Type()],
    [sourceResultType, int32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression,
    receiver,
    argument: index,
    sourceResultType,
    sourceSelectedDeclaration: arrayMemberDeclaration("at"),
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.array.indexer");
  assert.deepEqual(facts.get(expression, csharpTargetOperationFactKey)?.resultType, int32Type());
});
test("JS surface defers element access without selected source evidence even when receiver carrier is finalized", () => {
  const expression = {};
  const receiver = fakeNodeSubject({});
  const index = fakeNodeSubject({});
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, { carrier: int32ReadOnlyListType() });
  const targetTypes = new Map([
    [index, int32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression,
    receiver,
    argument: index,
  }, fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface defers element access without selected receiver facts", () => {
  const expression = {};
  const receiver = fakeNodeSubject({});
  const index = fakeNodeSubject({});
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [index, int32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression,
    receiver,
    argument: index,
  }, fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface rejects single-target calls without selected signature identity", () => {
  const call = {};
  const receiver = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ReadOnlyListType()],
    [value, int32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequestWithoutSignature(call, arrayMemberDeclaration("includes"), {
    arguments: [value],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_REQUIRES_SELECTED_SIGNATURE");
});
test("JS surface uses the TSTS-selected signature declaration instead of reselecting from callee evidence", () => {
  const call = {};
  const receiver = {};
  const value = {};
  const selectedDeclaration = arrayMemberDeclaration("includes");
  const mismatchedCalleeDeclaration = arrayMemberDeclaration("join");
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ReadOnlyListType()],
    [value, int32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, selectedDeclaration, {
    arguments: [value],
    calleeReceiver: receiver,
    sourceCalleeDeclaration: mismatchedCalleeDeclaration,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.sourceName, "includes");
});
test("JS surface maps Array.concat from selected declaration and closed array argument facts", () => {
  const call = {};
  const receiver = {};
  const values = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32EnumerableType()],
    [values, int32EnumerableType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, arrayMemberDeclaration("concat"), {
    arguments: [values],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.concat");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
});
test("JS surface rejects Array member selection without proven receiver carrier facts", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, arrayMemberDeclaration("join"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Array\.join/);
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
  assert.equal(facts.get(call, selectedTargetSignatureFactKey), undefined);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps Array.from, Array.of, and Array.isArray from selected declarations", () => {
  const arrayFromSource = {};
  const arrayOfFirst = {};
  const arrayOfSecond = {};
  const arrayProbe = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [arrayFromSource, int32EnumerableType()],
    [arrayOfFirst, int32Type()],
    [arrayOfSecond, int32Type()],
    [arrayProbe, int32ReadOnlyListType()],
  ])));
  const arrayFromCall = {};
  const arrayOfCall = {};
  const isArrayCall = {};

  const fromResult = provider.mapCheckedCall(jsCallRequest(arrayFromCall, arrayMemberDeclaration("from"), {
    arguments: [arrayFromSource],
  }), fakeContext(facts));
  const ofResult = provider.mapCheckedCall(jsCallRequest(arrayOfCall, arrayMemberDeclaration("of"), {
    arguments: [arrayOfFirst, arrayOfSecond],
  }), fakeContext(facts));
  const isArrayResult = provider.mapCheckedCall(jsCallRequest(isArrayCall, arrayMemberDeclaration("isArray"), {
    arguments: [arrayProbe],
  }), fakeContext(facts));

  assert.equal(fromResult.kind, "accept");
  assert.equal(fromResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.from:array:native");
  assert.equal(fromResult.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(ofResult.kind, "accept");
  assert.equal(ofResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.of:native");
  assert.equal(ofResult.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(isArrayResult.kind, "accept");
  assert.equal(isArrayResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.isArray:native");
});
test("JS surface maps Array length construction from selected declaration and closed result carrier facts", () => {
  const construct = { Kind: "KindNewExpression" };
  const length = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [construct, jsArrayType(int32Type())],
    [length, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(construct, arrayConstructorDeclaration(), {
    arguments: [length],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSArray..ctor(System.Double)");
  assert.equal(result.value.selectedSignature.member.kind, "constructor");
  assert.equal(result.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Js.JSArray`1");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
  assert.equal(facts.get(construct, csharpTargetOperationFactKey)?.operationKind, "constructor");
});
test("JS surface rejects Array construction without closed result carrier facts", () => {
  const construct = { Kind: "KindNewExpression" };
  const length = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [length, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(construct, arrayConstructorDeclaration(), {
    arguments: [length],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Array\.constructor/);
  assert.equal(facts.get(construct, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps Boolean.toString from selected declaration and closed bool receiver facts", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, boolType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Boolean", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.BooleanOps.toString");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.String");
});
test("JS surface maps Boolean.valueOf from selected declaration and closed bool receiver facts", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, boolType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Boolean", "valueOf"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.BooleanOps.valueOf");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});
test("JS surface maps Boolean call conversion from selected declaration and closed argument facts", () => {
  const call = { Kind: "KindCallExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [argument, boolType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("BooleanConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Globals.Boolean(System.Object)");
  assert.equal(result.value.selectedSignature.member.targetName, "Boolean");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
  assert.equal(facts.get(call, csharpTargetOperationFactKey)?.operationKind, "method");
});
test("JS surface maps zero-argument Boolean call conversion from selected declaration", () => {
  const call = { Kind: "KindCallExpression" };
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("BooleanConstructor", "")), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Globals.Boolean(System.Object)");
  assert.equal(result.value.selectedSignature.member.parameters[0].optional, true);
});
test("JS surface rejects Boolean call conversion without closed argument facts", () => {
  const call = { Kind: "KindCallExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("BooleanConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /Boolean\.constructor/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface rejects new Boolean until an explicit wrapper carrier exists", () => {
  const construct = { Kind: "KindNewExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [argument, boolType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(construct, sourceLibraryMemberDeclaration("BooleanConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Boolean\.constructor/);
  assert.equal(facts.get(construct, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps Object.toString to BooleanOps for closed bool primitive receivers", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, boolType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Object", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.BooleanOps.toString");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.String");
});
test("JS surface maps Object.toString to String.toString for closed string primitive receivers", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, stringType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Object", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "System.String.ToString");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.String");
});
test("JS surface maps Object.toString to Number.toString for closed number primitive receivers", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Object", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Number.toString");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.String");
});
test("JS surface rejects Object.toString without closed primitive receiver facts", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Object", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Object\.toString/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface rejects Boolean methods without closed bool receiver facts", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Boolean", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Boolean\.toString/);
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface rejects Boolean methods for non-boolean closed receivers", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Boolean", "valueOf"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Boolean\.valueOf/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps Number.toString from selected declaration and closed number receiver facts", () => {
  const call = {};
  const radixCall = {};
  const receiver = {};
  const primitiveReceiver = {};
  const radix = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, float64Type()],
    [primitiveReceiver, int32Type()],
    [radix, int32Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Number", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const radixResult = provider.mapCheckedCall(jsCallRequest(radixCall, sourceLibraryMemberDeclaration("Number", "toString"), {
    calleeReceiver: primitiveReceiver,
    arguments: [radix],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Number.toString");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.String");
  assert.equal(radixResult.kind, "accept");
  assert.equal(radixResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Number.toString:int32-radix");
  assert.equal(radixResult.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(radixResult.value.selectedSignature.member.parameters.length, 1);
  assert.equal(radixResult.value.selectedSignature.member.parameters[0].type.name, "int32");
  assert.equal(radixResult.value.selectedSignature.member.returnType.id, "System.String");
});
test("JS surface rejects Number.toString(radix) without a closed integral receiver fact", () => {
  const call = {};
  const receiver = {};
  const radix = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, float64Type()],
    [radix, int32Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Number", "toString"), {
    calleeReceiver: receiver,
    arguments: [radix],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Number\.toString/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface hard-rejects selected Number locale formatting until Intl facts exist", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Number", "toLocaleString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Number\.toLocaleString/);
  assert.match(result.diagnostic.message, /Intl\.NumberFormat-compatible locale and options semantics/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps Number.valueOf from selected declaration and closed number receiver facts", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Number", "valueOf"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Number.valueOf");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.returnType.name, "float64");
});
test("JS surface rejects Number methods without closed number receiver facts", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Number", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Number\.toString/);
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface rejects Number methods for non-number closed receivers", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, boolType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Number", "valueOf"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Number\.valueOf/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
