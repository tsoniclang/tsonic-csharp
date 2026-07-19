import { test, assert, createCompilerSessionFromFiles, formatDiagnostics, providerVirtualDeclarationFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, targetOperationFactKey, createTsonicCoreSourceExtension, csharpArrayBoundaryFactKey, csharpSourceReturnCarrierFactKey, csharpTargetIterationFactKey, csharpTargetMutationOperationFactKey, csharpTargetOperationFactKey, createCsharpJsSurfaceExtension, createCsharpSourceSemanticsExtension, createCsharpTargetSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, planArrayLiteralExpressionWithCarrier, createCsharpNativeOperationsProvider, createProductCsharpJsSurfaceOperationsProvider, mapCsharpJsSurfaceCheckedIteration, csharpJsMapCollectionPolicy, csharpJsSetCollectionPolicy, createCsharpJsSurfaceOperationsProvider, arrayLengthRequest, arrayLengthDeclaration, arrayMemberDeclaration, arrayConstructorDeclaration, sourceLibraryMemberDeclaration, namespaceImportSourceFile, fakeNamespaceImportContext, sourceLibraryPropertyRequest, sourceLibraryElementRequest, fakeNodeSubject, fakeHost, fakeContext, fakeAstIs, createCsharpSession, sourceProfileFiles, declarationFiles, fakeTargetPack, collectNodesByKind, collectFactValues, collectAllNodes, jsCallRequest, jsCallRequestWithoutSignature, fakeCallCallee, selectedSourceLibrarySignature, nodejsCallRequest, nodejsCallRequestWithoutSignature, nodejsPropertyRequest, nodejsVirtualDeclaration, nodejsVirtualMemberDeclaration, int32Type, float64Type, boolType, nullishType, stringType, regexpType, dateType, jsObjectType, tsValueType, jsArrayType, jsMapType, jsSetType, int32ArrayType, int32EnumerableType, int32ReadOnlyListType, genericSystemCollectionType, recordDictionaryType, surfaceObjectShapeFact, dictionaryBinding, actionOfInt32Type, funcInt32ToStringType, TestFactStore } from "./surface-boundary.helpers.mjs";

test("JS surface maps Object.assign only from selected declaration and closed JSObject target facts", () => {
  const facts = new TestFactStore();
  const call = {};
  const target = {};
  const source = {};
  const targetTypes = new Map([
    [target, jsObjectType()],
    [source, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "assign"), {
    arguments: [target, source],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.assign");
  assert.equal(result.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Js.JSObject");
});
test("JS surface maps Object.assign nullish sources from explicit source type facts", () => {
  const facts = new TestFactStore();
  const call = {};
  const target = {};
  const nullSource = { SemanticType: nullishType() };
  const objectSource = {};
  const undefinedSource = { SemanticType: nullishType() };
  const targetTypes = new Map([
    [target, jsObjectType()],
    [objectSource, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "assign"), {
    arguments: [target, nullSource, objectSource, undefinedSource],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.assign");
  assert.equal(result.value.selectedSignature.member.parameters[1]?.paramsArray, true);
  assert.equal(result.value.selectedSignature.member.parameters[1]?.type.element.id, "System.Object");
  assert.equal(result.value.selectedSignature.member.parameters[1]?.csharpAcceptsCheckedSourceArgument, true);
});
test("JS surface rejects Object.assign source without object-helper or nullish facts", () => {
  const facts = new TestFactStore();
  const call = {};
  const target = {};
  const source = {};
  const targetTypes = new Map([
    [target, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "assign"), {
    arguments: [target, source],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /argument 2/);
});
test("JS surface maps Object.assign for closed Record dictionary target facts", () => {
  const facts = new TestFactStore();
  const call = {};
  const target = {};
  const source = {};
  const dictionary = recordDictionaryType(stringType(), int32Type());
  const targetTypes = new Map([
    [target, dictionary],
    [source, dictionary],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes, dictionaryBinding()));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "assign"), {
    arguments: [target, source],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.assign:dictionary");
  assert.equal(result.value.selectedSignature.member.parameters[0]?.type.id, "System.Collections.Generic.Dictionary`2");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Collections.Generic.Dictionary`2");
});
test("JS surface rejects Object.assign without closed JSObject target facts", () => {
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));
  const call = {};

  const callResult = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "assign"), {
    arguments: [{}, {}],
  }), fakeContext(facts));

  assert.equal(callResult.kind, "reject");
  assert.equal(callResult.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(callResult.diagnostic.message, /Object\.assign/);
});
test("JS surface accepts Object.assign property-valued access without C# operation facts", () => {
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));
  const expression = {};

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("ObjectConstructor", "assign"), "assign"), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.Object.assign.callee");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface does not map console or Object calls without selected declarations", () => {
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const consoleResult = provider.mapCheckedCall(jsCallRequest({}, undefined), fakeContext(facts));
  const objectResult = provider.mapCheckedCall(jsCallRequest({}, undefined, { arguments: [{}] }), fakeContext(facts));

  assert.equal(consoleResult.kind, "defer");
  assert.equal(objectResult.kind, "defer");
});
test("JS surface rejects selected RegExp calls without closed RegExp receiver facts", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("RegExp", "exec")), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /RegExp\.exec/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface hard-rejects declared unsupported selected operations with evidence", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Promise", "then")), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.equal(result.diagnostic.nodeOrSpan, call);
  assert.match(result.diagnostic.message, /Promise\.then/);
  assert.match(result.diagnostic.message, /Promise\/Task carrier/);
  assert.equal(result.diagnostic.evidence?.[0]?.details?.capabilityId, "diagnostic.unsupported-selected-surface-operation");
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps RegExp.test from selected declaration and closed RegExp receiver facts", () => {
  const call = {};
  const receiver = {};
  const value = {};
  const facts = new TestFactStore();
  facts.setCsharpRuntimeCarrier(receiver, regexpType());
  const targetTypes = new Map([
    [value, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("RegExp", "test"), {
    arguments: [value],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.RegExp.test");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});
test("JS surface rejects RegExp.test without closed RegExp receiver facts even when arguments match", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("RegExp", "test"), {
    arguments: [value],
    calleeReceiver: {},
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
});
test("JS surface maps RegExp.source only with selected declaration and closed RegExp receiver facts", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiverType, regexpType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("RegExp", "source"), "not-the-selected-name", {
    receiverType,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Js.RegExp.source");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Js.RegExp.source");
});
test("JS surface maps RegExp modern boolean properties only with closed RegExp receiver facts", () => {
  const hasIndicesExpression = {};
  const unicodeSetsExpression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiverType, regexpType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const hasIndicesResult = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(hasIndicesExpression, sourceLibraryMemberDeclaration("RegExp", "hasIndices"), "hasIndices", {
    receiverType,
  }), fakeContext(facts));
  const unicodeSetsResult = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(unicodeSetsExpression, sourceLibraryMemberDeclaration("RegExp", "unicodeSets"), "unicodeSets", {
    receiverType,
  }), fakeContext(facts));

  assert.equal(hasIndicesResult.kind, "accept");
  assert.equal(hasIndicesResult.value.operation.operationId, "Tsonic.CSharp.Js.RegExp.hasIndices");
  assert.equal(unicodeSetsResult.kind, "accept");
  assert.equal(unicodeSetsResult.value.operation.operationId, "Tsonic.CSharp.Js.RegExp.unicodeSets");
});
test("JS surface rejects selected RegExp.source without closed RegExp receiver facts", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("RegExp", "source"), "source", {
    receiverType,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
});
test("JS surface maps selected string helpers only with closed string receiver facts", () => {
  const call = {};
  const receiver = {};
  const form = {};
  const facts = new TestFactStore();
  facts.setCsharpRuntimeCarrier(receiver, stringType());
  const targetTypes = new Map([
    [form, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("String", "normalize"), {
    arguments: [form],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.String.normalize");
});
test("JS surface rejects selected string instance helpers without closed string receiver facts", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("String", "trim"), {
    calleeReceiver: {},
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /String\.trim/);
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
});
test("JS surface rejects selected string helpers without closed string receiver facts", () => {
  const call = {};
  const form = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [form, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("String", "normalize"), {
    arguments: [form],
    calleeReceiver: {},
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /String\.normalize/);
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
});
test("JS surface maps String call conversion from selected declaration and closed argument facts", () => {
  const call = { Kind: "KindCallExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [argument, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("StringConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Globals.String(System.Object)");
  assert.equal(result.value.selectedSignature.member.targetName, "String");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.String");
  assert.equal(facts.get(call, csharpTargetOperationFactKey)?.operationKind, "method");
});
test("JS surface maps zero-argument String call conversion from selected declaration", () => {
  const call = { Kind: "KindCallExpression" };
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("StringConstructor", "")), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Globals.String(System.Object)");
  assert.equal(result.value.selectedSignature.member.parameters[0].optional, true);
});
test("JS surface rejects String call conversion without closed argument facts", () => {
  const call = { Kind: "KindCallExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("StringConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /String\.constructor/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface rejects new String until an explicit wrapper carrier exists", () => {
  const construct = { Kind: "KindNewExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [argument, stringType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(construct, sourceLibraryMemberDeclaration("StringConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /String\.constructor/);
  assert.equal(facts.get(construct, csharpTargetOperationFactKey), undefined);
});
test("JS surface hard-rejects selected String.raw and regex match lanes until exact runtime facts exist", () => {
  const receiver = {};
  const pattern = {};
  const rawTemplate = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, stringType()],
    [pattern, stringType()],
    [rawTemplate, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const matchResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("String", "match"), {
    arguments: [pattern],
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const matchAllResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("String", "matchAll"), {
    arguments: [pattern],
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const rawResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("String", "raw"), {
    arguments: [rawTemplate],
  }), fakeContext(facts));

  assert.equal(matchResult.kind, "reject");
  assert.equal(matchResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(matchResult.diagnostic.message, /String\.match/);
  assert.match(matchResult.diagnostic.message, /RegExpMatchArray/);

  assert.equal(matchAllResult.kind, "reject");
  assert.equal(matchAllResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(matchAllResult.diagnostic.message, /String\.matchAll/);
  assert.match(matchAllResult.diagnostic.message, /iterator/);

  assert.equal(rawResult.kind, "reject");
  assert.equal(rawResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(rawResult.diagnostic.message, /String\.raw/);
  assert.match(rawResult.diagnostic.message, /template-object/);
});
test("JS surface maps Math.max only with provider-proven numeric arguments", () => {
  const call = {};
  const left = {};
  const right = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [left, float64Type()],
    [right, float64Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Math", "max"), {
    arguments: [left, right],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Math.max");
  assert.equal(result.value.selectedSignature.member.parameters[0]?.paramsArray, true);
});
test("JS surface rejects selected Math calls without closed numeric argument facts", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Math", "abs"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /argument 1/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface rejects selected Math calls without provider metadata rows", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Math", "missingOperation")), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Math\.missingOperation/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface hard-rejects selected standard-library properties without target facts", () => {
  const expression = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("String", "constructor"), "constructor"), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /String\.constructor/);
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface defers foreign JS calls and foreign JS property operations without target facts", () => {
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));
  const foreignFileName = "/src/globals.d.ts";

  const objectResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("ObjectConstructor", "keys", foreignFileName)), fakeContext(facts));
  const jsonResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("JSON", "parse", foreignFileName)), fakeContext(facts));
  const consoleResult = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest({}, sourceLibraryMemberDeclaration("Console", "log", foreignFileName), "log"), fakeContext(facts));

  assert.equal(objectResult.kind, "defer");
  assert.equal(jsonResult.kind, "defer");
  assert.equal(consoleResult.kind, "defer");
});
test("JS surface maps Record element access through provider-owned Dictionary indexer facts", () => {
  const expression = {};
  const receiver = fakeNodeSubject({});
  const receiverType = {};
  receiver.SemanticType = receiverType;
  const key = {};
  const facts = new TestFactStore();
  const dictionaryType = recordDictionaryType(stringType(), int32Type());
  const targetTypes = new Map([
    [receiverType, dictionaryType],
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes, dictionaryBinding()));

  const result = provider.mapCheckedElementAccess(sourceLibraryElementRequest(
    expression,
    receiver,
    key,
    sourceLibraryMemberDeclaration("Record", ""),
    { receiverType },
  ), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationKind, "indexer");
  assert.equal(result.value.operation.targetOperation, "Item");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationKind, "indexer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.memberName, "Item");
});
test("JS surface maps string for-of to string-code-point iteration facts", () => {
  const statement = {};
  const expression = fakeNodeSubject({});
  const expressionType = {};
  expression.SemanticType = expressionType;
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [expressionType, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedIteration({
    target: "csharp",
    statement,
    expression,
    sourceExpressionType: expressionType,
    kind: "for-of",
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationKind, "iteration");
  assert.equal(result.value.operation.targetOperation, "string-code-point");
  const iteration = facts.get(statement, csharpTargetIterationFactKey);
  assert.equal(iteration?.iterationKind, "sync");
  assert.equal(iteration?.lowering.kind, "string-code-point");
  assert.equal(iteration?.lowering.lengthMember, "Length");
  assert.equal(iteration?.lowering.substringMember, "Substring");
  assert.equal(iteration?.lowering.highSurrogateOperation.memberName, "IsHighSurrogate");
  assert.deepEqual(iteration?.elementType, stringType());
});
test("JS surface maps object-shape for-in to finalized object-shape key facts", () => {
  const statement = {};
  const expression = {};
  const facts = new TestFactStore();
  const objectShape = surfaceObjectShapeFact("ShapeCarrier", [
    { sourceName: "alpha", targetName: "Alpha", memberKind: "property", type: int32Type() },
    { sourceName: "beta", targetName: "Beta", memberKind: "property", type: stringType() },
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map(), undefined, new Map([
    [expression, objectShape],
  ])));

  const result = provider.mapCheckedIteration({
    target: "csharp",
    statement,
    expression,
    kind: "for-in",
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationKind, "iteration");
  assert.equal(result.value.operation.targetOperation, "object-shape-keys");
  const iteration = facts.get(statement, csharpTargetIterationFactKey);
  assert.equal(iteration?.iterationKind, "property-key");
  assert.deepEqual(iteration?.lowering, { kind: "object-shape-keys" });
  assert.deepEqual(iteration?.elementType, stringType());
});
test("JS surface maps Record for-in through provider-owned Dictionary key facts", () => {
  const statement = {};
  const expression = fakeNodeSubject({});
  const expressionType = {};
  expression.SemanticType = expressionType;
  const facts = new TestFactStore();
  const dictionaryType = recordDictionaryType(stringType(), int32Type());
  const targetTypes = new Map([
    [expressionType, dictionaryType],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes, dictionaryBinding()));

  const result = provider.mapCheckedIteration({
    target: "csharp",
    statement,
    expression,
    sourceExpressionType: expressionType,
    kind: "for-in",
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationKind, "iteration");
  assert.equal(result.value.operation.targetOperation, "key-collection");
  const iteration = facts.get(statement, csharpTargetIterationFactKey);
  assert.equal(iteration?.iterationKind, "property-key");
  assert.equal(iteration?.lowering.kind, "key-collection");
  assert.equal(iteration?.lowering.keysMember.memberName, "Keys");
  assert.equal(iteration?.lowering.keysMember.selectedMember.id, "System.Collections.Generic.Dictionary`2.Keys");
  assert.deepEqual(iteration?.elementType, stringType());
});
test("JS surface iteration defers unsupported target selection without recording facts", () => {
  const statement = {};
  const expression = {};
  const facts = new TestFactStore();

  const result = mapCsharpJsSurfaceCheckedIteration({
    target: "rust",
    statement,
    expression,
    kind: "for-of",
  }, fakeContext(facts), {
    targetId: "csharp",
    extensionId: "tsonic.csharp.surface.js",
    getTargetTypeRefForSubject: () => stringType(),
    getCsharpObjectShapeFactForSubject: () => undefined,
    isCsharpStringType: (type) => type?.id === "System.String",
    selectTargetMember: () => undefined,
    csharpProviderDiagnostic: (_extensionId, extensionCode, diagnosticCode, message) => ({
      code: `TS${diagnosticCode}`,
      category: "error",
      source: "tsonic-csharp",
      extensionCode,
      message,
    }),
  });

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(statement, csharpTargetIterationFactKey), undefined);
});
test("JS surface rejects Record for-in without string-key enumeration facts", () => {
  const statement = {};
  const expression = fakeNodeSubject({});
  const expressionType = {};
  expression.SemanticType = expressionType;
  const facts = new TestFactStore();
  const dictionaryType = recordDictionaryType(int32Type(), int32Type());
  const targetTypes = new Map([
    [expressionType, dictionaryType],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes, dictionaryBinding()));

  const result = provider.mapCheckedIteration({
    target: "csharp",
    statement,
    expression,
    sourceExpressionType: expressionType,
    kind: "for-in",
  }, fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_RECORD_DICTIONARY_FOR_IN_KEY_TYPE_UNSUPPORTED");
  assert.equal(facts.get(statement, csharpTargetIterationFactKey), undefined);
});
