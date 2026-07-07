import { test, assert, createCompilerSessionFromFiles, formatDiagnostics, providerVirtualDeclarationFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, targetOperationFactKey, createTsonicCoreSourceExtension, csharpArrayBoundaryFactKey, csharpSourceReturnCarrierFactKey, csharpTargetIterationFactKey, csharpTargetMutationOperationFactKey, csharpTargetOperationFactKey, createCsharpJsSurfaceExtension, createCsharpSourceSemanticsExtension, createCsharpTargetSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, planArrayLiteralExpressionWithCarrier, createCsharpNativeOperationsProvider, createProductCsharpJsSurfaceOperationsProvider, mapCsharpJsSurfaceCheckedIteration, csharpJsMapCollectionPolicy, csharpJsSetCollectionPolicy, createCsharpJsSurfaceOperationsProvider, arrayLengthRequest, arrayLengthDeclaration, arrayMemberDeclaration, arrayConstructorDeclaration, sourceLibraryMemberDeclaration, namespaceImportSourceFile, fakeNamespaceImportContext, sourceLibraryPropertyRequest, fakeNodeSubject, fakeHost, fakeContext, fakeAstIs, createCsharpSession, sourceProfileFiles, declarationFiles, fakeTargetPack, collectNodesByKind, collectFactValues, collectAllNodes, jsCallRequest, jsCallRequestWithoutSignature, fakeCallCallee, selectedSourceLibrarySignature, nodejsCallRequest, nodejsCallRequestWithoutSignature, nodejsPropertyRequest, nodejsVirtualDeclaration, nodejsVirtualMemberDeclaration, int32Type, float64Type, boolType, nullishType, stringType, regexpType, dateType, jsObjectType, tsValueType, jsArrayType, jsMapType, jsSetType, int32ArrayType, int32EnumerableType, int32ReadOnlyListType, genericSystemCollectionType, recordDictionaryType, surfaceObjectShapeFact, dictionaryBinding, actionOfInt32Type, funcInt32ToStringType, TestFactStore } from "./surface-boundary.helpers.mjs";

test("JS surface maps Number static methods and constants from selected declarations", () => {
  const call = {};
  const argument = {};
  const property = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [argument, float64Type()],
  ])));

  const isFinite = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("NumberConstructor", "isFinite"), {
    arguments: [argument],
  }), fakeContext(facts));
  const maxSafe = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(property, sourceLibraryMemberDeclaration("NumberConstructor", "MAX_SAFE_INTEGER"), "not-the-selected-name"), fakeContext(facts));

  assert.equal(isFinite.kind, "accept");
  assert.equal(isFinite.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Number.isFinite");
  assert.equal(isFinite.value.selectedSignature.member.returnType.name, "bool");
  assert.equal(maxSafe.kind, "accept");
  assert.equal(maxSafe.value.operation.operationId, "Tsonic.CSharp.Js.Number.MAX_SAFE_INTEGER");
  assert.equal(facts.get(property, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Js.Number.MAX_SAFE_INTEGER");
});
test("JS surface maps Number call conversion from selected declaration and closed argument facts", () => {
  const call = { Kind: "KindCallExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [argument, stringType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("NumberConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Globals.Number(System.Object)");
  assert.equal(result.value.selectedSignature.member.targetName, "Number");
  assert.equal(result.value.selectedSignature.member.returnType.name, "float64");
  assert.equal(facts.get(call, csharpTargetOperationFactKey)?.operationKind, "method");
});
test("JS surface maps zero-argument Number call conversion from selected declaration", () => {
  const call = { Kind: "KindCallExpression" };
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("NumberConstructor", "")), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Globals.Number(System.Object)");
  assert.equal(result.value.selectedSignature.member.parameters[0].optional, true);
});
test("JS surface rejects Number call conversion without closed argument facts", () => {
  const call = { Kind: "KindCallExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("NumberConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /Number\.constructor/);
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("JS surface rejects new Number until an explicit wrapper carrier exists", () => {
  const construct = { Kind: "KindNewExpression" };
  const argument = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [argument, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest(construct, sourceLibraryMemberDeclaration("NumberConstructor", ""), {
    arguments: [argument],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Number\.constructor/);
  assert.equal(facts.get(construct, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps Map and Set runtime built-ins from selected declarations and closed carrier facts", () => {
  const mapConstruct = { Kind: "KindNewExpression" };
  const setConstruct = { Kind: "KindNewExpression" };
  const mapReceiver = {};
  const setReceiver = {};
  const key = {};
  const value = {};
  const setValue = {};
  const mapSize = {};
  const setSize = {};
  const mapType = jsMapType(stringType(), int32Type());
  const setType = jsSetType(int32Type());
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [mapConstruct, mapType],
    [setConstruct, setType],
    [mapReceiver, mapType],
    [setReceiver, setType],
    [key, stringType()],
    [value, int32Type()],
    [setValue, int32Type()],
  ])));

  const mapConstructResult = provider.mapCheckedCall(jsCallRequest(mapConstruct, sourceLibraryMemberDeclaration("MapConstructor", ""), {
  }), fakeContext(facts));
  const setConstructResult = provider.mapCheckedCall(jsCallRequest(setConstruct, sourceLibraryMemberDeclaration("SetConstructor", ""), {
  }), fakeContext(facts));
  const mapSetResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "set"), {
    arguments: [key, value],
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const mapGetResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "get"), {
    arguments: [key],
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const mapHasResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "has"), {
    arguments: [key],
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const mapDeleteResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "delete"), {
    arguments: [key],
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const mapClearResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "clear"), {
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const mapKeysResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "keys"), {
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const mapValuesResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "values"), {
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const setAddResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Set", "add"), {
    arguments: [setValue],
    calleeReceiver: setReceiver,
  }), fakeContext(facts));
  const setHasResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Set", "has"), {
    arguments: [setValue],
    calleeReceiver: setReceiver,
  }), fakeContext(facts));
  const setDeleteResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Set", "delete"), {
    arguments: [setValue],
    calleeReceiver: setReceiver,
  }), fakeContext(facts));
  const setClearResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Set", "clear"), {
    calleeReceiver: setReceiver,
  }), fakeContext(facts));
  const setKeysResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Set", "keys"), {
    calleeReceiver: setReceiver,
  }), fakeContext(facts));
  const mapEntriesResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "entries"), {
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const setEntriesResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Set", "entries"), {
    calleeReceiver: setReceiver,
  }), fakeContext(facts));
  const setValuesResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Set", "values"), {
    calleeReceiver: setReceiver,
  }), fakeContext(facts));
  const mapSizeResult = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(mapSize, sourceLibraryMemberDeclaration("Map", "size"), "size", {
    receiverType: mapReceiver,
  }), fakeContext(facts));
  const setSizeResult = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(setSize, sourceLibraryMemberDeclaration("Set", "size"), "size", {
    receiverType: setReceiver,
  }), fakeContext(facts));

  assert.equal(mapConstructResult.kind, "accept");
  assert.equal(mapConstructResult.value.selectedSignature.member.declaringType.id, "Tsonic.CSharp.Js.Map`2");
  assert.equal(setConstructResult.kind, "accept");
  assert.equal(setConstructResult.value.selectedSignature.member.declaringType.id, "Tsonic.CSharp.Js.Set`1");
  assert.equal(mapSetResult.kind, "accept");
  assert.equal(mapSetResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Map.set");
  assert.equal(mapSetResult.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Js.Map`2");
  assert.equal(mapGetResult.kind, "accept");
  assert.equal(mapGetResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Map.get:value");
  assert.equal(mapGetResult.value.selectedSignature.member.targetName, "getValue");
  assert.equal(mapGetResult.value.selectedSignature.member.static, true);
  assert.equal(mapGetResult.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(mapGetResult.value.selectedSignature.member.declaringType.id, "Tsonic.CSharp.Js.Map`2");
  assert.equal(mapGetResult.value.selectedSignature.member.parameters.length, 1);
  assert.equal(mapGetResult.value.selectedSignature.member.returnType.id, "System.Nullable`1");
  assert.equal(mapHasResult.kind, "accept");
  assert.equal(mapHasResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Map.has");
  assert.equal(mapDeleteResult.kind, "accept");
  assert.equal(mapDeleteResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Map.delete");
  assert.equal(mapClearResult.kind, "accept");
  assert.equal(mapClearResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Map.clear");
  assert.equal(mapKeysResult.kind, "accept");
  assert.equal(mapKeysResult.value.selectedSignature.member.returnType.typeArguments[0].id, "System.String");
  assert.equal(mapValuesResult.kind, "accept");
  assert.equal(mapValuesResult.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
  assert.equal(setAddResult.kind, "accept");
  assert.equal(setAddResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Set.add");
  assert.equal(setHasResult.kind, "accept");
  assert.equal(setHasResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Set.has");
  assert.equal(setDeleteResult.kind, "accept");
  assert.equal(setDeleteResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Set.delete");
  assert.equal(setClearResult.kind, "accept");
  assert.equal(setClearResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Set.clear");
  assert.equal(setKeysResult.kind, "accept");
  assert.equal(setKeysResult.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
  assert.equal(mapEntriesResult.kind, "accept");
  assert.equal(mapEntriesResult.value.selectedSignature.member.returnType.typeArguments[0].kind, "tuple");
  assert.equal(setEntriesResult.kind, "accept");
  assert.equal(setEntriesResult.value.selectedSignature.member.returnType.typeArguments[0].kind, "tuple");
  assert.equal(setValuesResult.kind, "accept");
  assert.equal(setValuesResult.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
  assert.equal(mapSizeResult.kind, "accept");
  assert.equal(mapSizeResult.value.operation.operationId, "Tsonic.CSharp.Js.Map.size");
  assert.equal(setSizeResult.kind, "accept");
  assert.equal(setSizeResult.value.operation.operationId, "Tsonic.CSharp.Js.Set.size");
});
test("JS surface Map and Set policies select compat-runtime SameValueZero carriers", () => {
  assert.equal(csharpJsMapCollectionPolicy.target.carrierLane, "compat-runtime");
  assert.equal(csharpJsMapCollectionPolicy.target.equalitySemantics, "js-same-value-zero");
  assert.equal(csharpJsSetCollectionPolicy.target.carrierLane, "compat-runtime");
  assert.equal(csharpJsSetCollectionPolicy.target.equalitySemantics, "js-same-value-zero");
});
test("JS surface rejects Map and Set instance calls without closed carrier facts", () => {
  const mapReceiver = {};
  const setReceiver = {};
  const key = {};
  const value = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [key, stringType()],
    [value, int32Type()],
  ])));

  const mapSetResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Map", "set"), {
    arguments: [key, value],
    calleeReceiver: mapReceiver,
  }), fakeContext(facts));
  const setAddResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Set", "add"), {
    arguments: [value],
    calleeReceiver: setReceiver,
  }), fakeContext(facts));

  assert.equal(mapSetResult.kind, "reject");
  assert.equal(mapSetResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(mapSetResult.diagnostic.message, /Map\.set/);
  assert.equal(setAddResult.kind, "reject");
  assert.equal(setAddResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(setAddResult.diagnostic.message, /Set\.add/);
});
test("JS surface maps Array.from over Map and Set iterables from finalized collection carrier facts", () => {
  const mapSource = {};
  const setSource = {};
  const mapFromCall = {};
  const setFromCall = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [mapSource, jsMapType(stringType(), int32Type())],
    [setSource, jsSetType(stringType())],
  ])));

  const mapFromResult = provider.mapCheckedCall(jsCallRequest(mapFromCall, arrayMemberDeclaration("from"), {
    arguments: [mapSource],
  }), fakeContext(facts));
  const setFromResult = provider.mapCheckedCall(jsCallRequest(setFromCall, arrayMemberDeclaration("from"), {
    arguments: [setSource],
  }), fakeContext(facts));

  assert.equal(mapFromResult.kind, "accept");
  assert.equal(mapFromResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.from:array:native");
  assert.equal(mapFromResult.value.selectedSignature.member.returnType.typeArguments[0].kind, "tuple");
  assert.equal(setFromResult.kind, "accept");
  assert.equal(setFromResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.from:array:native");
  assert.equal(setFromResult.value.selectedSignature.member.returnType.typeArguments[0].id, "System.String");
});
test("selected JS surface preserves explicit source primitive Map and Set type arguments", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function makeCollections(): void {
      const counts = new Map<string, int32>();
      const selected = counts.get("alpha");
      const ids = new Set<int32>();
      ids.add(selected ?? 0);
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const carriers = collectNodesByKind(sourceFile, session.ast, "KindNewExpression")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier)
    .filter((carrier) => carrier !== undefined);

  assert.deepEqual(carriers.map((carrier) => carrier.id), [
    "Tsonic.CSharp.Js.Map`2",
    "Tsonic.CSharp.Js.Set`1",
  ]);
  assert.equal(carriers[0].typeArguments[0].id, "System.String");
  assert.equal(carriers[0].typeArguments[1].name, "int32");
  assert.equal(carriers[1].typeArguments[0].name, "int32");
});
test("selected JS surface finalizes Map and Set size properties from checked receiver type identity", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function collectionSizes(): int32 {
      const counts = new Map<string, int32>();
      const ids = new Set<int32>();
      return counts.size + ids.size;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const sizeAccesses = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .filter((node) => session.ast.text(session.ast.name(node)) === "size");
  const operationIds = sizeAccesses.map((node) =>
    extensionHost.facts.get(node, csharpTargetOperationFactKey)?.operationId);
  const selectedOperationIds = sizeAccesses.map((node) =>
    extensionHost.facts.get(node, targetOperationFactKey)?.operationId);

  assert.deepEqual(operationIds, [
    "Tsonic.CSharp.Js.Map.size",
    "Tsonic.CSharp.Js.Set.size",
  ]);
  assert.deepEqual(selectedOperationIds, operationIds);
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});
test("selected JS surface finalizes Map and Set iterable-constructor size and Array.from length chains", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function collectionSizes(seed: int32): int32 {
      const source = new Map<string, int32>();
      source.set("alpha", 1);
      const copy = new Map<string, int32>(source.entries());
      copy.set("beta", seed);
      const values = Array.from(copy.values());
      const ids = new Set<int32>();
      ids.add(seed);
      const idCopy = new Set<int32>(ids.values());
      return copy.size + values.length + idCopy.size;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const selectedMemberIds = collectFactValues(sourceFile, session, extensionHost, selectedTargetSignatureFactKey)
    .map((fact) => fact.member.id);
  const carrierIds = collectFactValues(sourceFile, session, extensionHost, runtimeCarrierFactKey)
    .map((fact) => fact.carrier.id ?? fact.carrier.kind);
  const sizeOperationIds = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .filter((node) => ["size", "length"].includes(session.ast.text(session.ast.name(node))))
    .map((node) => extensionHost.facts.get(node, csharpTargetOperationFactKey)?.operationId);
  const selectedOperationIds = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .filter((node) => ["size", "length"].includes(session.ast.text(session.ast.name(node))))
    .map((node) => extensionHost.facts.get(node, targetOperationFactKey)?.operationId);

  const evidence = JSON.stringify({ selectedMemberIds, carrierIds, sizeOperationIds, selectedOperationIds });
  assert.ok(sizeOperationIds.includes("Tsonic.CSharp.Js.Map.size"), evidence);
  assert.ok(sizeOperationIds.includes("Tsonic.CSharp.Js.Set.size"), evidence);
  assert.ok(sizeOperationIds.includes("tsonic.csharp.js.Array.length"), evidence);
  assert.deepEqual(selectedOperationIds, sizeOperationIds, evidence);
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});
test("JS surface maps Array.at and Array.map from selected declarations and closed callback facts", () => {
  const atCall = {};
  const mapCall = {};
  const receiver = {};
  const index = {};
  const callback = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ReadOnlyListType()],
    [index, int32Type()],
    [callback, funcInt32ToStringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const atResult = provider.mapCheckedCall(jsCallRequest(atCall, arrayMemberDeclaration("at"), {
    arguments: [index],
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const mapResult = provider.mapCheckedCall(jsCallRequest(mapCall, arrayMemberDeclaration("map"), {
    arguments: [callback],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(atResult.kind, "accept");
  assert.equal(atResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.at:int32:value");
  assert.equal(atResult.value.selectedSignature.member.returnType.id, "System.Nullable`1");
  assert.equal(atResult.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
  assert.equal(mapResult.kind, "accept");
  assert.equal(mapResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.map:1");
  assert.equal(mapResult.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(mapResult.value.selectedSignature.member.returnType.typeArguments[0].id, "System.String");
});
test("JS surface selects closed JSArray carrier members for full array semantics", () => {
  const pushCall = {};
  const atCall = {};
  const sliceCall = {};
  const mapCall = {};
  const receiver = {};
  const value = {};
  const index = {};
  const callback = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, jsArrayType(int32Type())],
    [value, int32Type()],
    [index, int32Type()],
    [callback, funcInt32ToStringType()],
  ])));

  const pushResult = provider.mapCheckedCall(jsCallRequest(pushCall, arrayMemberDeclaration("push"), {
    arguments: [value],
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const atResult = provider.mapCheckedCall(jsCallRequest(atCall, arrayMemberDeclaration("at"), {
    arguments: [index],
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const sliceResult = provider.mapCheckedCall(jsCallRequest(sliceCall, arrayMemberDeclaration("slice"), {
    arguments: [index],
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const mapResult = provider.mapCheckedCall(jsCallRequest(mapCall, arrayMemberDeclaration("map"), {
    arguments: [callback],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(pushResult.kind, "accept");
  assert.equal(pushResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.push:full-js");
  assert.equal(atResult.kind, "accept");
  assert.equal(atResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.at:full-js:int32:value");
  assert.equal(sliceResult.kind, "accept");
  assert.equal(sliceResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.slice:full-js");
  assert.equal(sliceResult.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Js.JSArray`1");
  assert.equal(mapResult.kind, "accept");
  assert.equal(mapResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.map:full-js:1");
  assert.equal(mapResult.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Js.JSArray`1");
  assert.equal(mapResult.value.selectedSignature.member.returnType.typeArguments[0].id, "System.String");
});
test("JS surface maps array iterator and copy methods from selected declarations", () => {
  const receiver = {};
  const value = {};
  const index = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, new Map([
    [receiver, int32ReadOnlyListType()],
    [value, int32Type()],
    [index, int32Type()],
  ])));

  const keysResult = provider.mapCheckedCall(jsCallRequest({}, arrayMemberDeclaration("keys"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const entriesResult = provider.mapCheckedCall(jsCallRequest({}, arrayMemberDeclaration("entries"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const toReversedResult = provider.mapCheckedCall(jsCallRequest({}, arrayMemberDeclaration("toReversed"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const withResult = provider.mapCheckedCall(jsCallRequest({}, arrayMemberDeclaration("with"), {
    arguments: [index, value],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(keysResult.kind, "accept");
  assert.equal(keysResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.keys");
  assert.equal(keysResult.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
  assert.equal(entriesResult.kind, "accept");
  assert.equal(entriesResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.entries");
  assert.equal(entriesResult.value.selectedSignature.member.returnType.typeArguments[0].kind, "tuple");
  assert.equal(toReversedResult.kind, "accept");
  assert.equal(toReversedResult.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(withResult.kind, "accept");
  assert.equal(withResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.with");
});
test("JS surface rejects Array.concat without closed array argument facts", () => {
  const call = {};
  const receiver = {};
  const values = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([[receiver, int32EnumerableType()]]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, arrayMemberDeclaration("concat"), {
    arguments: [values],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Array\.concat/);
});
test("JS surface maps Math.random through the selected JS runtime declaration", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Math", "random")), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Math.random");
  assert.equal(result.value.selectedSignature.member.declaringType.id, "Tsonic.CSharp.Js.Math");
});
test("JS surface maps Math.PI through the selected JS runtime declaration", () => {
  const expression = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("Math", "PI"), "not-the-selected-name"), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Js.Math.PI");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Js.Math.PI");
});
test("JS surface rejects selected Math properties without provider metadata rows", () => {
  const expression = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("Math", "missingConstant"), "not-the-selected-name"), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Math\.missingConstant/);
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps Date static calls through selected JS runtime declarations", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("DateConstructor", "now")), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Date.now");
  assert.equal(result.value.selectedSignature.member.declaringType.id, "Tsonic.CSharp.Js.Date");
});
test("JS surface maps Date call and construction from selected declaration identity", () => {
  const call = { Kind: "KindCallExpression" };
  const construct = { Kind: "KindNewExpression" };
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));
  const selectedDeclaration = sourceLibraryMemberDeclaration("DateConstructor", "");

  const callResult = provider.mapCheckedCall(jsCallRequest(call, selectedDeclaration), fakeContext(facts));
  const constructResult = provider.mapCheckedCall(jsCallRequest(construct, selectedDeclaration, {
  }), fakeContext(facts));

  assert.equal(callResult.kind, "accept");
  assert.equal(callResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Date.call");
  assert.equal(callResult.value.selectedSignature.member.kind, "method");
  assert.equal(constructResult.kind, "accept");
  assert.equal(constructResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Date..ctor()");
  assert.equal(constructResult.value.selectedSignature.member.kind, "constructor");
});
test("JS surface maps unresolved one-argument Date construction to closed Date value carrier", () => {
  const construct = { Kind: "KindNewExpression" };
  const value = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(construct, sourceLibraryMemberDeclaration("DateConstructor", ""), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Date..ctor(System.Object)");
  assert.equal(result.value.selectedSignature.member.parameters[0].type.id, "System.Object");
});
test("JS surface maps Date instance methods only with closed Date receiver facts", () => {
  const call = {};
  const receiver = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, dateType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Date", "toISOString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Date.toISOString");
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.String");
});
test("JS surface rejects selected Date instance methods without closed Date receiver facts", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Date", "toISOString"), {
    calleeReceiver: {},
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
});
test("JS surface maps zero-argument Math.max to JS runtime semantics", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Math", "max")), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Math.max");
});
test("JS surface rejects multi-target calls without exact selected signature identity", () => {
  const call = {};
  const receiver = {};
  const callback = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ReadOnlyListType()],
    [callback, actionOfInt32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequestWithoutSignature(call, arrayMemberDeclaration("forEach"), {
    arguments: [callback],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_REQUIRES_SELECTED_SIGNATURE");
});
test("JS surface maps multi-target calls from exact selected signature identity", () => {
  const call = {};
  const receiver = {};
  const callback = {};
  const selectedDeclaration = arrayMemberDeclaration("forEach");
  const selectedSignature = selectedSourceLibrarySignature(selectedDeclaration);
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ReadOnlyListType()],
    [callback, actionOfInt32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, selectedDeclaration, {
    arguments: [callback],
    calleeReceiver: receiver,
    sourceSelectedSignature: selectedSignature,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Array.forEach:1");
});
test("JS surface rejects Object operations without closed Object carrier facts", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "keys"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /Object\.keys/);
});