import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompilerSessionFromFiles, formatDiagnostics, providerVirtualDeclarationFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, targetOperationFactKey } from "@tsonic/tsts";
import { createTsonicCoreSourceExtension } from "@tsonic/source-core";
import { csharpArrayBoundaryFactKey, csharpSourceReturnCarrierFactKey, csharpTargetIterationFactKey, csharpTargetMutationOperationFactKey, csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import {
  createCsharpJsSurfaceExtension,
  createCsharpNodejsProviderPackageExtension,
  createCsharpSourceSemanticsExtension,
  createCsharpTargetSemanticsExtension,
} from "../dist/index.js";
import { planArrayLiteralExpressionWithCarrier } from "../dist/backend/planner/array-literals/index.js";
import { createCsharpNativeOperationsProvider } from "../dist/source/csharp-source-semantics/operations-provider.js";
import {
  createCsharpJsSurfaceOperationsProvider as createProductCsharpJsSurfaceOperationsProvider,
} from "../dist/source/csharp-source-semantics/surface-extensions.js";
import {
  createCsharpNodejsProviderPackageBindingProvider,
  createCsharpNodejsProviderPackageOperationsMappers,
  createCsharpNodejsProviderPackageOperationsProvider,
} from "../dist/source/csharp-source-semantics/provider-packages/nodejs/index.js";
import { mapCsharpJsSurfaceCheckedIteration } from "../dist/source/csharp-source-semantics/surfaces/js/iteration.js";
import { csharpJsMapCollectionPolicy } from "../dist/source/csharp-source-semantics/surfaces/js/collection-target-metadata/map-metadata.js";
import { csharpJsSetCollectionPolicy } from "../dist/source/csharp-source-semantics/surfaces/js/collection-target-metadata/set-metadata.js";

function createCsharpJsSurfaceOperationsProvider(host) {
  return createProductCsharpJsSurfaceOperationsProvider({ operationsProviderHost: host });
}

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

test("JS surface maps Array.length only from the selected standard-library declaration", () => {
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
  const sourceSelectedSymbol = {
    ...sourceLibraryMemberDeclaration("String", "length"),
    declarations: [arrayLengthDeclaration()],
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
  }, fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionId, "tsonic.csharp.surface.js");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NON_INTEGRAL_STRING_INDEX");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("JS surface maps array element access from finalized receiver carrier facts", () => {
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

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.array.indexer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.js.array.indexer");
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

test("JS surface rejects calls when selected signature and declaration facts disagree", () => {
  const call = {};
  const receiver = {};
  const value = {};
  const selectedDeclaration = arrayMemberDeclaration("includes");
  const mismatchedSignature = selectedSourceLibrarySignature(arrayMemberDeclaration("join"));
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ReadOnlyListType()],
    [value, int32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, selectedDeclaration, {
    arguments: [value],
    calleeReceiver: receiver,
    sourceSelectedSignature: mismatchedSignature,
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_SIGNATURE_DECLARATION_MISMATCH");
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

test("JS surface maps JSON.parse from selected standard-library declaration and closed string facts", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "parse"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSON.parse");
  assert.equal(result.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Js.TsValue");
  assert.equal(facts.get(call, runtimeCarrierFactKey), undefined);
});

test("JS surface maps JSON.stringify only from closed JSON value carrier facts", () => {
  const call = {};
  const parsedStringifyCall = {};
  const value = {};
  const parsedValue = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
    [parsedValue, tsValueType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [value],
  }), fakeContext(facts));
  const parsedResult = provider.mapCheckedCall(jsCallRequest(parsedStringifyCall, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [parsedValue],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSON.stringify:object");
  assert.equal(parsedResult.kind, "accept");
  assert.equal(parsedResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  assert.equal(parsedResult.value.selectedSignature.member.returnType.id, "System.String");
  assert.equal(facts.get(parsedStringifyCall, runtimeCarrierFactKey), undefined);
});

test("JS surface maps nested JSON.stringify(JSON.parse(value)) through finalized TsValue carrier facts", () => {
  const parseCall = {};
  const stringifyCall = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const parseResult = provider.mapCheckedCall(jsCallRequest(parseCall, sourceLibraryMemberDeclaration("JSON", "parse"), {
    arguments: [value],
  }), fakeContext(facts));
  assert.equal(parseResult.kind, "accept");
  facts.set(parseCall, selectedTargetSignatureFactKey, parseResult.value.selectedSignature);
  facts.set(parseCall, runtimeCarrierFactKey, { carrier: tsValueType() });

  const stringifyResult = provider.mapCheckedCall(jsCallRequest(stringifyCall, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [parseCall],
  }), fakeContext(facts));

  assert.equal(facts.get(parseCall, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.TsValue");
  assert.equal(stringifyResult.kind, "accept");
  assert.equal(stringifyResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  assert.equal(facts.get(stringifyCall, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
});

test("JS surface defers JSON.stringify without closed JSON value carrier facts until finalization", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
});

test("JS surface rejects JSON.stringify when the argument carrier fact is mutated away from TsValue", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  facts.set(value, runtimeCarrierFactKey, { carrier: { kind: "opaque", id: "any" } });
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});

test("selected JS surface finalizes source-level nested JSON.parse carrier for JSON.stringify", () => {
  const session = createCsharpSession(`
    export function roundtrip(value: string) {
      return JSON.stringify(JSON.parse(value));
    }
  `, { selectedSurfaces: [{ id: "js" }], typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const calls = collectNodesByKind(sourceFile, session.ast, "KindCallExpression");
  const stringifyCall = calls.find((call) =>
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id === "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  const parseCall = calls.find((call) =>
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id === "Tsonic.CSharp.Js.JSON.parse");

  assert.equal(extensionHost.facts.get(parseCall, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.TsValue");
  assert.equal(extensionHost.facts.get(stringifyCall, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  assert.equal(extensionHost.diagnostics.all().some((diagnostic) => diagnostic.extensionCode === "FACT_CONFLICT"), false);
  assert.equal(extensionHost.diagnostics.all().some((diagnostic) => diagnostic.extensionCode === "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED"), false);
});

test("selected JS surface finalizes array element and length operations from carrier facts", () => {
  const session = createCsharpSession(`
    export function read(values: number[]): number {
      const value = values[0];
      return value + values.length;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const elementAccess = collectNodesByKind(sourceFile, session.ast, "KindElementAccessExpression")[0];
  const lengthAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .find((node) => session.ast.text(session.ast.name(node)) === "length");

  assert.ok(elementAccess);
  assert.ok(lengthAccess);
  assert.equal(extensionHost.facts.get(elementAccess, targetOperationFactKey)?.operationId, "tsonic.csharp.js.array.indexer");
  assert.equal(extensionHost.facts.get(elementAccess, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.js.array.indexer");
  assert.equal(extensionHost.facts.get(elementAccess, csharpTargetOperationFactKey)?.memberName, "Item");
  assert.equal(extensionHost.facts.get(lengthAccess, targetOperationFactKey)?.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(extensionHost.facts.get(lengthAccess, csharpTargetOperationFactKey)?.memberName, "Count");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).includes("CSHARP_JS_ARRAY_ELEMENT_ACCESS_REQUIRES_CARRIER"), false);
});

test("selected JS surface preserves provider-returned native array length from selected target facts", () => {
  const session = createCsharpSession(`
    import { readdirSync } from "node:fs";

    export function count(path: string): number {
      const entries = readdirSync(path);
      return entries.length;
    }
  `, { selectedSurfaces: [{ id: "js" }], selectedPackages: [{ id: "nodejs" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const call = collectNodesByKind(sourceFile, session.ast, "KindCallExpression")[0];
  const lengthAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .find((node) => session.ast.text(session.ast.name(node)) === "length");

  assert.ok(call);
  assert.ok(lengthAccess);
  assert.equal(extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.returnType.kind, "array");
  assert.equal(extensionHost.facts.get(lengthAccess, targetOperationFactKey)?.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(extensionHost.facts.get(lengthAccess, csharpTargetOperationFactKey)?.memberName, "Length");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});

test("selected JS surface records awaited provider-native array result carriers", () => {
  const session = createCsharpSession(`
    import { readdir } from "node:fs/promises";

    export async function count(path: string): Promise<number> {
      const entries = await readdir(path);
      return entries.length;
    }
  `, { selectedSurfaces: [{ id: "js" }], selectedPackages: [{ id: "nodejs" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const awaitExpression = collectNodesByKind(sourceFile, session.ast, "KindAwaitExpression")[0];
  const lengthAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .find((node) => session.ast.text(session.ast.name(node)) === "length");

  assert.ok(awaitExpression);
  assert.ok(lengthAccess);
  assert.equal(extensionHost.facts.get(awaitExpression, runtimeCarrierFactKey)?.carrier.kind, "array");
  assert.equal(extensionHost.facts.get(lengthAccess, targetOperationFactKey)?.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(extensionHost.facts.get(lengthAccess, csharpTargetOperationFactKey)?.memberName, "Length");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});

test("selected JS surface finalizes Array length construction to JSArray carrier", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function make(size: int32): int32 {
      const values = new Array<int32>(size);
      return values.length;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const construct = collectNodesByKind(sourceFile, session.ast, "KindNewExpression")[0];

  assert.ok(construct);
  assert.equal(extensionHost.facts.get(construct, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.JSArray`1");
  assert.equal(extensionHost.facts.get(construct, runtimeCarrierFactKey)?.carrier.typeArguments[0].name, "int32");
  assert.equal(extensionHost.facts.get(construct, selectedTargetSignatureFactKey)?.member.id, "Tsonic.CSharp.Js.JSArray..ctor(System.Double)");
  assert.equal(extensionHost.facts.get(construct, selectedTargetSignatureFactKey)?.member.returnType.typeArguments[0].name, "int32");
  assert.equal(extensionHost.facts.get(construct, csharpTargetOperationFactKey)?.operationKind, "constructor");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});

test("selected JS surface finalizes Array length assignment as value-producing setLength operation", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function reset(values: int32[], size: int32): int32 {
      return values.length = size;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  const operation = extensionHost.facts.get(assignment, csharpTargetMutationOperationFactKey);

  assert.ok(assignment);
  assert.equal(operation?.operationId, "tsonic.csharp.js.array.setLength");
  assert.equal(operation?.operationKind, "method");
  assert.equal(operation?.memberName, "setLength");
  assert.equal(operation?.resultType?.name, "int32");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});

test("selected JS surface records inferred source-owned array return carriers on declarations", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function make(value: int32) {
      return [value, value];
    }

    const values = make(1);
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const functionDeclaration = collectNodesByKind(sourceFile, session.ast, "KindFunctionDeclaration")[0];
  const returnCarrier = extensionHost.facts.get(functionDeclaration, csharpSourceReturnCarrierFactKey)?.carrier;

  assert.ok(functionDeclaration);
  assert.equal(returnCarrier?.id, "System.Collections.Generic.List`1");
  assert.equal(returnCarrier?.typeArguments?.[0]?.name, "float64");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});

test("selected JS surface classifies array hole-presence as full JS without inventing operation facts", () => {
  const session = createCsharpSession(`
    export function hasSlot(values: number[], index: number): boolean {
      return index in values;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const valuesIdentifier = collectNodesByKind(sourceFile, session.ast, "KindIdentifier")
    .filter((node) => session.ast.text(node) === "values")
    .find((node) => extensionHost.facts.get(node, runtimeCarrierFactKey) !== undefined);
  const holePresence = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];

  assert.ok(valuesIdentifier);
  assert.ok(holePresence);
  assert.equal(extensionHost.facts.get(valuesIdentifier, csharpArrayBoundaryFactKey)?.coreCarrierLane, "js-full-internal");
  assert.equal(extensionHost.facts.get(valuesIdentifier, csharpArrayBoundaryFactKey)?.publicShape, "compat-facade");
  assert.equal(extensionHost.facts.get(valuesIdentifier, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.JSArray`1");
  assert.equal(extensionHost.facts.get(holePresence, targetOperationFactKey), undefined);
  assert.equal(extensionHost.facts.get(holePresence, csharpTargetOperationFactKey), undefined);
});

test("selected JS surface finalizes unchanged chained standard-library TypeScript operations", () => {
  const session = createCsharpSession(`
    export function existingTs(values: number[], text: string): string {
      const normalized = text.trim().toUpperCase();
      const joined = values.join(",");
      const keys = Object.keys(values).join("|");
      const encoded = JSON.stringify(JSON.parse(text));
      const stamp = new Date(0).toISOString();
      const matched = /ok/.test(encoded);
      console.log(normalized, joined, keys, stamp, matched, Math.max(values.length, 1));
      return normalized + joined + keys + encoded + stamp;
    }
  `, { selectedSurfaces: [{ id: "js" }], typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const selectedMemberIds = collectFactValues(sourceFile, session, extensionHost, selectedTargetSignatureFactKey)
    .map((fact) => fact.member.id);
  const operationIds = collectFactValues(sourceFile, session, extensionHost, targetOperationFactKey)
    .map((fact) => fact.operationId);

  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.String.trim"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.String.toUpperCase"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Array.join"));
  assert.ok(selectedMemberIds.filter((id) => id === "Tsonic.CSharp.Js.Array.join").length >= 2);
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Object.keys:jsarray"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.JSON.parse"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.JSON.stringify:tsvalue"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Date..ctor(System.Double)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Date.toISOString"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.RegExp.test"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.console.log"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Math.max"));
  assert.ok(operationIds.includes("tsonic.csharp.js.Array.length"));
});

test("C# planner rejects sparse array literal elisions before dense lowering", () => {
  const diagnostics = [];
  const literal = {
    Kind: "KindArrayLiteralExpression",
    Elements: {
      Nodes: [
        { Kind: "KindNumericLiteral", Text: "1" },
        { Kind: "KindOmittedExpression" },
        { Kind: "KindNumericLiteral", Text: "3" },
      ],
    },
  };

  const result = planArrayLiteralExpressionWithCarrier(literal, {}, {
    ast: {
      kindName: (node) => node?.Kind ?? "Undefined",
    },
  }, diagnostics, { kind: "array", element: int32Type() }, {
    planExpression: () => assert.fail("Sparse array literal elisions must fail before element expression planning."),
    planExpressionWithExpectedType: () => assert.fail("Sparse array literal elisions must fail before expected element planning."),
  });

  assert.equal(result, undefined);
  assert.equal(diagnostics[0]?.code, "CSHARP_UNSUPPORTED_AST");
  assert.match(diagnostics[0]?.message, /Sparse array literal elisions require closed JSArray hole construction facts/);
});

test("JS surface accepts method-valued console property access without C# operation facts", () => {
  const expression = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("Console", "log"), "log"), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.Console.log.callee");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("JS surface maps console.log calls from selected standard-library declaration identity", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "log"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.log");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.parameters[0]?.paramsArray, true);
});

test("JS surface maps console.assert through closed condition and message facts", () => {
  const call = {};
  const condition = {};
  const message = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [condition, boolType()],
    [message, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "assert"), {
    arguments: [condition, message],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.assert");
});

test("JS surface maps console assert optional and variadic source shape", () => {
  const zeroArgCall = {};
  const multiArgCall = {};
  const condition = {};
  const message = {};
  const count = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [condition, boolType()],
    [message, stringType()],
    [count, float64Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const zeroArgResult = provider.mapCheckedCall(jsCallRequest(zeroArgCall, sourceLibraryMemberDeclaration("Console", "assert")), fakeContext(facts));
  const multiArgResult = provider.mapCheckedCall(jsCallRequest(multiArgCall, sourceLibraryMemberDeclaration("Console", "assert"), {
    arguments: [condition, message, count],
  }), fakeContext(facts));

  assert.equal(zeroArgResult.kind, "accept");
  assert.equal(zeroArgResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.assert");
  assert.equal(zeroArgResult.value.selectedSignature.member.parameters[0]?.optional, true);
  assert.equal(zeroArgResult.value.selectedSignature.member.parameters[1]?.paramsArray, true);
  assert.equal(multiArgResult.kind, "accept");
  assert.equal(multiArgResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.assert");
});

test("JS surface maps full selected Console member shapes", () => {
  const item = {};
  const options = {};
  const properties = {};
  const label = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [item, stringType()],
    [options, stringType()],
    [properties, int32ReadOnlyListType()],
    [label, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const dirResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "dir"), {
    arguments: [item, options],
  }), fakeContext(facts));
  const dirNoArgResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "dir")), fakeContext(facts));
  const dirxmlResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "dirxml"), {
    arguments: [item, options],
  }), fakeContext(facts));
  const tableResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "table"), {
    arguments: [item, properties],
  }), fakeContext(facts));
  const timeStampResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "timeStamp"), {
    arguments: [label],
  }), fakeContext(facts));

  assert.equal(dirResult.kind, "accept");
  assert.equal(dirResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.dir");
  assert.equal(dirNoArgResult.kind, "accept");
  assert.equal(dirNoArgResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.dir");
  assert.equal(dirxmlResult.kind, "accept");
  assert.equal(dirxmlResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.dirxml");
  assert.equal(dirxmlResult.value.selectedSignature.member.parameters[0]?.paramsArray, true);
  assert.equal(tableResult.kind, "accept");
  assert.equal(tableResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.table");
  assert.equal(timeStampResult.kind, "accept");
  assert.equal(timeStampResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.timeStamp");
});

test("JS surface rejects console.time when selected arguments do not match runtime shape", () => {
  const call = {};
  const label = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [label, float64Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "time"), {
    arguments: [label],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
});

test("JS surface rejects console.log without closed argument target facts", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "log"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /argument 1/);
});

test("JS surface maps Object.keys from selected standard-library declaration and closed JSObject carrier", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "keys"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.keys:jsobject");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].id, "System.String");
});

test("JS surface maps Object.values from selected standard-library declaration and closed JSObject carrier", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "values"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.values:jsobject");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].id, "System.Object");
});

test("JS surface maps Object.entries from selected standard-library declaration and closed JSObject carrier", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "entries"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.entries:jsobject");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].kind, "tuple");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].elements[0].id, "System.String");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].elements[1].id, "System.Object");
});

test("JS surface maps Object.keys for closed JSArray and string carriers", () => {
  const arrayCall = {};
  const arrayValue = {};
  const stringCall = {};
  const stringValue = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [arrayValue, jsArrayType(int32Type())],
    [stringValue, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const arrayResult = provider.mapCheckedCall(jsCallRequest(arrayCall, sourceLibraryMemberDeclaration("ObjectConstructor", "keys"), {
    arguments: [arrayValue],
  }), fakeContext(facts));
  const stringResult = provider.mapCheckedCall(jsCallRequest(stringCall, sourceLibraryMemberDeclaration("ObjectConstructor", "keys"), {
    arguments: [stringValue],
  }), fakeContext(facts));

  assert.equal(arrayResult.kind, "accept");
  assert.equal(arrayResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.keys:jsarray");
  assert.equal(stringResult.kind, "accept");
  assert.equal(stringResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.keys:string");
});

test("JS surface maps Object.values and Object.entries for closed Record dictionary carriers", () => {
  const valuesCall = {};
  const entriesCall = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, recordDictionaryType(stringType(), int32Type())],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes, dictionaryBinding()));

  const valuesResult = provider.mapCheckedCall(jsCallRequest(valuesCall, sourceLibraryMemberDeclaration("ObjectConstructor", "values"), {
    arguments: [value],
  }), fakeContext(facts));
  const entriesResult = provider.mapCheckedCall(jsCallRequest(entriesCall, sourceLibraryMemberDeclaration("ObjectConstructor", "entries"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(valuesResult.kind, "accept");
  assert.equal(valuesResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.values:dictionary");
  assert.equal(valuesResult.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(valuesResult.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
  assert.equal(entriesResult.kind, "accept");
  assert.equal(entriesResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.entries:dictionary");
  assert.equal(entriesResult.value.selectedSignature.member.returnType.typeArguments[0].kind, "tuple");
  assert.equal(entriesResult.value.selectedSignature.member.returnType.typeArguments[0].elements[1].name, "int32");
});

test("JS surface maps Object.hasOwnProperty only from selected declaration and closed JSObject receiver", () => {
  const call = {};
  const receiver = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, jsObjectType()],
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Object", "hasOwnProperty"), {
    arguments: [key],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSObject.hasOwnProperty");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});

test("JS surface maps Object.hasOwn only from selected declaration and closed JSObject target facts", () => {
  const call = {};
  const value = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "hasOwn"), {
    arguments: [value, key],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.hasOwn");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});

test("JS surface maps Object.hasOwn for closed Record dictionary target facts", () => {
  const call = {};
  const value = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, recordDictionaryType(stringType(), int32Type())],
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes, dictionaryBinding()));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "hasOwn"), {
    arguments: [value, key],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.hasOwn:dictionary");
  assert.equal(result.value.selectedSignature.member.parameters[0]?.type.id, "System.Collections.Generic.Dictionary`2");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});

test("JS surface rejects Object.hasOwn without supported closed object-helper target facts", () => {
  const call = {};
  const value = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, boolType()],
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "hasOwn"), {
    arguments: [value, key],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Object\.hasOwn/);
});

test("JS surface rejects Object.hasOwnProperty without closed JSObject receiver facts", () => {
  const call = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Object", "hasOwnProperty"), {
    arguments: [key],
    calleeReceiver: {},
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
});

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
  const targetTypes = new Map([
    [receiver, regexpType()],
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
  const targetTypes = new Map([
    [receiver, stringType()],
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

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression,
    receiver,
    argument: key,
  }, fakeContext(facts));

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

test("NodeJS provider package maps calls from the selected provider signature identity", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "join", "node:path.join(System.String[])"));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Node.path.join(System.String[])");
});

test("NodeJS provider package maps expanded path and fs calls from selected provider signature identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const pathCall = {};
  const pathSignature = {};
  const fsCall = {};
  const fsSignature = {};
  facts.set(pathSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "resolve", "node:path.resolve(System.String[])"));
  facts.set(fsSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:fs", "readFileSync", "node:fs.readFileSync(System.String,System.String)"));

  const pathResult = provider.mapCheckedCall(nodejsCallRequest(pathCall, pathSignature), fakeContext(facts));
  const fsResult = provider.mapCheckedCall(nodejsCallRequest(fsCall, fsSignature), fakeContext(facts));

  assert.equal(pathResult.kind, "accept");
  assert.equal(pathResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.path.resolve(System.String[])");
  assert.equal(fsResult.kind, "accept");
  assert.equal(fsResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.fs.readFileSync(System.String,System.String)");
});

test("NodeJS provider package maps path.parse and path.format through ParsedPath provider facts", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const parseCall = {};
  const parseSignature = {};
  const formatCall = {};
  const formatSignature = {};
  const extExpression = {};
  const extDeclaration = {};
  facts.set(parseSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "parse", "node:path.parse(System.String)"));
  facts.set(formatSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "format", "node:path.format(Tsonic.CSharp.Node.ParsedPath)"));
  facts.set(extDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:path",
    "ParsedPath",
    "ext",
    "node:path.ParsedPath.ext",
  ));

  const parseResult = provider.mapCheckedCall(nodejsCallRequest(parseCall, parseSignature), fakeContext(facts));
  const formatResult = provider.mapCheckedCall(nodejsCallRequest(formatCall, formatSignature), fakeContext(facts));
  const extResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(extExpression, extDeclaration), fakeContext(facts));

  assert.equal(parseResult.kind, "accept");
  assert.equal(parseResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.path.parse(System.String)");
  assert.equal(parseResult.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Node.ParsedPath");
  assert.equal(formatResult.kind, "accept");
  assert.equal(formatResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.path.format(Tsonic.CSharp.Node.ParsedPath)");
  assert.equal(extResult.kind, "accept");
  assert.equal(extResult.value.operation.operationId, "Tsonic.CSharp.Node.ParsedPath.ext");
});

test("NodeJS provider package maps fs.statSync and Stats members through selected provider facts", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const statCall = {};
  const statSignature = {};
  const sizeExpression = {};
  const sizeDeclaration = {};
  const isFileCall = {};
  const isFileSignature = {};
  facts.set(statSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:fs", "statSync", "node:fs.statSync(System.String)"));
  facts.set(sizeDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:fs",
    "Stats",
    "size",
    "node:fs.Stats.size",
  ));
  facts.set(isFileSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:fs",
    "Stats",
    "isFile",
    "node:fs.Stats.isFile",
    "node:fs.Stats.isFile()",
  ));

  const statResult = provider.mapCheckedCall(nodejsCallRequest(statCall, statSignature), fakeContext(facts));
  const sizeResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(sizeExpression, sizeDeclaration), fakeContext(facts));
  const isFileResult = provider.mapCheckedCall(nodejsCallRequest(isFileCall, isFileSignature), fakeContext(facts));

  assert.equal(statResult.kind, "accept");
  assert.equal(statResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.fs.statSync(System.String)");
  assert.equal(statResult.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Node.Stats");
  assert.equal(sizeResult.kind, "accept");
  assert.equal(sizeResult.value.operation.operationId, "Tsonic.CSharp.Node.Stats.size");
  assert.equal(isFileResult.kind, "accept");
  assert.equal(isFileResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.Stats.IsFile()");
});

test("NodeJS provider package maps expanded crypto and os calls from selected provider signature identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const cryptoCall = {};
  const cryptoSignature = {};
  const osCall = {};
  const osSignature = {};
  facts.set(cryptoSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:crypto", "randomInt", "node:crypto.randomInt(System.Int32,System.Int32?)"));
  facts.set(osSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:os", "tmpdir", "node:os.tmpdir()"));

  const cryptoResult = provider.mapCheckedCall(nodejsCallRequest(cryptoCall, cryptoSignature), fakeContext(facts));
  const osResult = provider.mapCheckedCall(nodejsCallRequest(osCall, osSignature), fakeContext(facts));

  assert.equal(cryptoResult.kind, "accept");
  assert.equal(cryptoResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.crypto.randomInt(System.Int32,System.Int32?)");
  assert.equal(osResult.kind, "accept");
  assert.equal(osResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.os.tmpdir()");
});

test("NodeJS provider package exposes assert and assert/strict as provider-owned virtual modules", () => {
  const bindingProvider = createCsharpNodejsProviderPackageBindingProvider();

  const bareOwnership = bindingProvider.ownsModule("assert", {});
  const nodeOwnership = bindingProvider.ownsModule("node:assert", {});
  const strictOwnership = bindingProvider.ownsModule("node:assert/strict", {});
  const resolution = bindingProvider.resolveModule("node:assert/strict", {});
  assert.equal(bareOwnership.kind, "owned");
  assert.equal(nodeOwnership.kind, "owned");
  assert.equal(strictOwnership.kind, "owned");
  assert.equal(resolution.kind, "virtual");
  assert.equal(resolution.providerModuleId, "node:assert");

  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal(model.moduleSpecifier, "node:assert/strict");
  assert.equal(model.providerModuleId, "node:assert");
  const ok = model.exports.find((entry) => entry.name === "ok");
  const strictEqual = model.exports.find((entry) => entry.name === "strictEqual");
  const deepStrictEqual = model.exports.find((entry) => entry.name === "deepStrictEqual");
  assert.equal(ok?.kind, "function");
  assert.equal(ok?.signatures?.[0]?.id, "node:assert.ok(System.Boolean,System.String)");
  assert.equal(ok?.signatures?.[0]?.parameters[0]?.type.kind, "boolean");
  assert.equal(strictEqual?.signatures?.[0]?.id, "node:assert.strictEqual(System.Object,System.Object,System.String)");
  assert.equal(strictEqual?.signatures?.[0]?.parameters[0]?.type.kind, "unknown");
  assert.equal(deepStrictEqual?.signatures?.[0]?.id, "node:assert.deepStrictEqual(System.Object,System.Object,System.String)");

  const strictEqualIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "node:assert/strict",
    exportName: "strictEqual",
    signatureId: "node:assert.strictEqual(System.Object,System.Object,System.String)",
  });
  const unsupportedIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "assert",
    exportName: "deepStrictEqual",
    signatureId: "node:assert.deepStrictEqual(System.Object,System.Object,System.String)",
  });
  assert.equal(strictEqualIdentity?.id, "Tsonic.CSharp.Node.assert.strictEqual(System.Object,System.Object,System.String)");
  assert.equal(unsupportedIdentity?.id, "unsupported:Tsonic.CSharp.Node.assert.deepStrictEqual(System.Object,System.Object,System.String)");
});

test("NodeJS provider package maps supported assert calls from selected provider signature identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const okCall = {};
  const okSignature = {};
  const failCall = {};
  const failSignature = {};
  const strictEqualCall = {};
  const strictEqualSignature = {};
  facts.set(okSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:assert", "ok", "node:assert.ok(System.Boolean,System.String)"));
  facts.set(failSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("assert", "fail", "node:assert.fail(System.String)"));
  facts.set(strictEqualSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:assert/strict", "strictEqual", "node:assert.strictEqual(System.Object,System.Object,System.String)"));

  const okResult = provider.mapCheckedCall(nodejsCallRequest(okCall, okSignature), fakeContext(facts));
  const failResult = provider.mapCheckedCall(nodejsCallRequest(failCall, failSignature), fakeContext(facts));
  const strictEqualResult = provider.mapCheckedCall(nodejsCallRequest(strictEqualCall, strictEqualSignature), fakeContext(facts));

  assert.equal(okResult.kind, "accept");
  assert.equal(okResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.assert.ok(System.Boolean,System.String)");
  assert.equal(okResult.value.selectedSignature.member.parameters[1]?.optional, true);
  assert.equal(failResult.kind, "accept");
  assert.equal(failResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.assert.fail(System.String)");
  assert.equal(strictEqualResult.kind, "accept");
  assert.equal(strictEqualResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.assert.strictEqual(System.Object,System.Object,System.String)");
});

test("NodeJS provider package fails closed for unsupported assert provider identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const deepStrictEqualCall = {};
  const deepStrictEqualSignature = {};
  const matchCall = {};
  const matchSignature = {};
  facts.set(deepStrictEqualSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:assert/strict", "deepStrictEqual", "node:assert.deepStrictEqual(System.Object,System.Object,System.String)"));
  facts.set(matchSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:assert", "match", "node:assert.match(System.String,System.Object,System.String)"));

  const deepStrictEqualResult = provider.mapCheckedCall(nodejsCallRequest(deepStrictEqualCall, deepStrictEqualSignature), fakeContext(facts));
  const matchResult = provider.mapCheckedCall(nodejsCallRequest(matchCall, matchSignature), fakeContext(facts));

  assert.equal(deepStrictEqualResult.kind, "reject");
  assert.equal(deepStrictEqualResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.equal(deepStrictEqualResult.diagnostic.nodeOrSpan, deepStrictEqualCall);
  assert.match(deepStrictEqualResult.diagnostic.message, /node:assert\/strict/);
  assert.match(deepStrictEqualResult.diagnostic.message, /deepStrictEqual/);
  assert.equal(deepStrictEqualResult.diagnostic.evidence?.[0]?.details?.capabilityId, "diagnostic.unsupported-selected-surface-operation");
  assert.equal(matchResult.kind, "reject");
  assert.equal(matchResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.equal(matchResult.diagnostic.nodeOrSpan, matchCall);
  assert.match(matchResult.diagnostic.message, /match/);
});

test("NodeJS assert provider declarations compile only when the nodejs provider package is selected", () => {
  const selectedSession = createCsharpSession(`
    import { fail, ok } from "node:assert/strict";
    ok(true);
    if (false) {
      fail("unreachable");
    }
  `, { selectedSurfaces: [{ id: "js" }], selectedPackages: [{ id: "nodejs" }] });
  const selectedSourceFile = selectedSession.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(selectedSession.ensureChecked(selectedSourceFile)), "");

  const nativeSession = createCsharpSession(`
    import { ok } from "node:assert/strict";
    ok(true);
  `);
  const nativeSourceFile = nativeSession.getSourceFile("/src/index.ts");
  assert.match(formatDiagnostics(nativeSession.ensureChecked(nativeSourceFile)), /Cannot find name 'node:assert\/strict'/);
});

test("selected NodeJS provider package finalizes unchanged ESM Node import operations", () => {
  const session = createCsharpSession(`
    import { ok } from "assert/strict";
    import { Buffer } from "buffer";
    import { existsSync, readFileSync, statSync } from "fs";
    import * as path from "node:path";
    import * as process from "node:process";
    import { cwd } from "node:process";
    import { URL, fileURLToPath } from "url";
    import { stripVTControlCharacters } from "util";

    export function existingNode(file: string): string {
      ok(existsSync(file), "missing");
      const data = readFileSync(file, "utf8");
      const stats = statSync(file);
      const url = new URL("file:///workspace/index.ts");
      const buffer = Buffer.from(data, "utf8");
      const clean = stripVTControlCharacters(data);
      return stats.isFile()
        ? path.join(cwd(), file) + path.sep + process.argv.length + buffer.length + fileURLToPath(url) + clean
        : process.platform;
    }
  `, { selectedSurfaces: [{ id: "js" }], selectedPackages: [{ id: "nodejs" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const selectedMemberIds = collectFactValues(sourceFile, session, extensionHost, selectedTargetSignatureFactKey)
    .map((fact) => fact.member.id);
  const operationIds = collectFactValues(sourceFile, session, extensionHost, targetOperationFactKey)
    .map((fact) => fact.operationId);

  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.assert.ok(System.Boolean,System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.fs.existsSync(System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.fs.readFileSync(System.String,System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.fs.statSync(System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.Stats.IsFile()"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.URL..ctor(System.String,System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.Buffer.from(System.String,System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.util.stripVTControlCharacters(System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.path.join(System.String[])"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.process.cwd()"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.url.fileURLToPath(Tsonic.CSharp.Node.URL)"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.path.sep"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.argv"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.platform"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.Buffer.length"));
});

test("NodeJS provider imports remain unavailable without the selected NodeJS provider package", () => {
  const nativeSession = createCsharpSession(`
    import { existsSync } from "fs";
    export const value = existsSync("package.json");
  `);
  const nativeSourceFile = nativeSession.getSourceFile("/src/index.ts");

  assert.match(formatDiagnostics(nativeSession.ensureChecked(nativeSourceFile)), /Cannot find name 'fs'/);
});

test("NodeJS provider package exposes util as a provider-owned virtual module", () => {
  const bindingProvider = createCsharpNodejsProviderPackageBindingProvider();

  const ownership = bindingProvider.ownsModule("util", {});
  const resolution = bindingProvider.resolveModule("util", {});
  assert.equal(ownership.kind, "owned");
  assert.equal(resolution.kind, "virtual");
  assert.equal(resolution.providerModuleId, "node:util");

  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal(model.moduleSpecifier, "util");
  assert.equal(model.providerModuleId, "node:util");
  const format = model.exports.find((entry) => entry.name === "format");
  const formatSignature = format?.signatures?.[0];
  const strip = model.exports.find((entry) => entry.name === "stripVTControlCharacters");
  const stripSignature = strip?.signatures?.[0];
  const debuglog = model.exports.find((entry) => entry.name === "debuglog");
  const isDeepStrictEqual = model.exports.find((entry) => entry.name === "isDeepStrictEqual");
  assert.equal(format?.kind, "function");
  assert.equal(formatSignature?.id, "node:util.format(System.Object,System.Object[])");
  assert.equal(formatSignature?.parameters[1]?.rest, true);
  assert.equal(formatSignature?.parameters[0]?.type.kind, "unknown");
  assert.equal(strip?.kind, "function");
  assert.equal(stripSignature?.id, "node:util.stripVTControlCharacters(System.String)");
  assert.equal(debuglog?.signatures?.[0]?.id, "node:util.debuglog(System.String)");
  assert.equal(debuglog?.signatures?.[0]?.returnType.kind, "function");
  assert.equal(isDeepStrictEqual?.signatures?.[0]?.id, "node:util.isDeepStrictEqual(System.Object,System.Object)");
  assert.equal(isDeepStrictEqual?.signatures?.[0]?.returnType.kind, "boolean");

  const unsupportedIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "util",
    exportName: "format",
    signatureId: "node:util.format(System.Object,System.Object[])",
  });
  const closedIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "util",
    exportName: "stripVTControlCharacters",
    signatureId: "node:util.stripVTControlCharacters(System.String)",
  });
  const debuglogIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "node:util",
    exportName: "debuglog",
    signatureId: "node:util.debuglog(System.String)",
  });
  assert.equal(unsupportedIdentity?.id, "unsupported:Tsonic.CSharp.Node.util.format(System.Object,System.Object[])");
  assert.equal(closedIdentity?.id, "Tsonic.CSharp.Node.util.stripVTControlCharacters(System.String)");
  assert.equal(debuglogIdentity?.id, "unsupported:Tsonic.CSharp.Node.util.debuglog(System.String)");
});

test("NodeJS provider package maps closed util string calls from selected provider signature identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const stripCall = {};
  const stripSignature = {};
  const usvCall = {};
  const usvSignature = {};
  facts.set(stripSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "stripVTControlCharacters", "node:util.stripVTControlCharacters(System.String)"));
  facts.set(usvSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "toUSVString", "node:util.toUSVString(System.String)"));

  const stripResult = provider.mapCheckedCall(nodejsCallRequest(stripCall, stripSignature), fakeContext(facts));
  const usvResult = provider.mapCheckedCall(nodejsCallRequest(usvCall, usvSignature), fakeContext(facts));

  assert.equal(stripResult.kind, "accept");
  assert.equal(stripResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.util.stripVTControlCharacters(System.String)");
  assert.equal(usvResult.kind, "accept");
  assert.equal(usvResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.util.toUSVString(System.String)");
});

test("NodeJS provider package fails closed for unsupported util provider identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const formatCall = {};
  const formatSignature = {};
  const formatWithOptionsCall = {};
  const formatWithOptionsSignature = {};
  const inspectCall = {};
  const inspectSignature = {};
  const debuglogCall = {};
  const debuglogSignature = {};
  const deprecateCall = {};
  const deprecateSignature = {};
  const isDeepStrictEqualCall = {};
  const isDeepStrictEqualSignature = {};
  facts.set(formatSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "format", "node:util.format(System.Object,System.Object[])"));
  facts.set(formatWithOptionsSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "formatWithOptions", "node:util.formatWithOptions(System.Object,System.Object,System.Object[])"));
  facts.set(inspectSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "inspect", "node:util.inspect(System.Object)"));
  facts.set(debuglogSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "debuglog", "node:util.debuglog(System.String)"));
  facts.set(deprecateSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "deprecate", "node:util.deprecate(Function,System.String,System.String)"));
  facts.set(isDeepStrictEqualSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:util", "isDeepStrictEqual", "node:util.isDeepStrictEqual(System.Object,System.Object)"));

  const formatResult = provider.mapCheckedCall(nodejsCallRequest(formatCall, formatSignature), fakeContext(facts));
  const formatWithOptionsResult = provider.mapCheckedCall(nodejsCallRequest(formatWithOptionsCall, formatWithOptionsSignature), fakeContext(facts));
  const inspectResult = provider.mapCheckedCall(nodejsCallRequest(inspectCall, inspectSignature), fakeContext(facts));
  const debuglogResult = provider.mapCheckedCall(nodejsCallRequest(debuglogCall, debuglogSignature), fakeContext(facts));
  const deprecateResult = provider.mapCheckedCall(nodejsCallRequest(deprecateCall, deprecateSignature), fakeContext(facts));
  const isDeepStrictEqualResult = provider.mapCheckedCall(nodejsCallRequest(isDeepStrictEqualCall, isDeepStrictEqualSignature), fakeContext(facts));

  assert.equal(formatResult.kind, "reject");
  assert.equal(formatResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.equal(formatResult.diagnostic.nodeOrSpan, formatCall);
  assert.match(formatResult.diagnostic.message, /node:util/);
  assert.match(formatResult.diagnostic.message, /format/);
  assert.equal(formatResult.diagnostic.evidence?.[0]?.details?.targetIdentityId, "unsupported:Tsonic.CSharp.Node.util.format(System.Object,System.Object[])");
  assert.equal(formatWithOptionsResult.kind, "reject");
  assert.equal(formatWithOptionsResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.match(formatWithOptionsResult.diagnostic.message, /formatWithOptions/);
  assert.equal(formatWithOptionsResult.diagnostic.evidence?.[0]?.details?.targetIdentityId, "unsupported:Tsonic.CSharp.Node.util.formatWithOptions(System.Object,System.Object,System.Object[])");
  assert.equal(inspectResult.kind, "reject");
  assert.equal(inspectResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.match(inspectResult.diagnostic.message, /inspect/);
  assert.equal(inspectResult.diagnostic.evidence?.[0]?.details?.targetIdentityId, "unsupported:Tsonic.CSharp.Node.util.inspect(System.Object)");
  assert.equal(debuglogResult.kind, "reject");
  assert.equal(debuglogResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.match(debuglogResult.diagnostic.message, /debuglog/);
  assert.equal(debuglogResult.diagnostic.evidence?.[0]?.details?.targetIdentityId, "unsupported:Tsonic.CSharp.Node.util.debuglog(System.String)");
  assert.equal(deprecateResult.kind, "reject");
  assert.equal(deprecateResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.match(deprecateResult.diagnostic.message, /deprecate/);
  assert.equal(deprecateResult.diagnostic.evidence?.[0]?.details?.targetIdentityId, "unsupported:Tsonic.CSharp.Node.util.deprecate(Function,System.String,System.String)");
  assert.equal(isDeepStrictEqualResult.kind, "reject");
  assert.equal(isDeepStrictEqualResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.match(isDeepStrictEqualResult.diagnostic.message, /isDeepStrictEqual/);
  assert.equal(isDeepStrictEqualResult.diagnostic.evidence?.[0]?.details?.targetIdentityId, "unsupported:Tsonic.CSharp.Node.util.isDeepStrictEqual(System.Object,System.Object)");
});

test("NodeJS provider package exposes URL as a provider-owned virtual module", () => {
  const bindingProvider = createCsharpNodejsProviderPackageBindingProvider();

  const bareOwnership = bindingProvider.ownsModule("url", {});
  const nodeOwnership = bindingProvider.ownsModule("node:url", {});
  const resolution = bindingProvider.resolveModule("url", {});
  assert.equal(bareOwnership.kind, "owned");
  assert.equal(nodeOwnership.kind, "owned");
  assert.equal(resolution.kind, "virtual");
  assert.equal(resolution.providerModuleId, "node:url");

  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal(model.moduleSpecifier, "url");
  assert.equal(model.providerModuleId, "node:url");
  const urlClass = model.exports.find((entry) => entry.name === "URL");
  const constructor = urlClass?.members?.find((entry) => entry.kind === "constructor");
  const href = urlClass?.members?.find((entry) => entry.name === "href");
  const canParse = urlClass?.members?.find((entry) => entry.name === "canParse");
  const searchParams = urlClass?.members?.find((entry) => entry.name === "searchParams");
  const pathToFileURL = model.exports.find((entry) => entry.name === "pathToFileURL");
  const format = model.exports.find((entry) => entry.name === "format");
  assert.equal(urlClass?.kind, "class");
  assert.equal(constructor?.signatures?.[0]?.id, "node:url.URL.constructor(System.String,System.String)");
  assert.equal(href?.kind, "property");
  assert.equal(canParse?.static, true);
  assert.equal(searchParams?.type?.kind, "provider-ref");
  assert.equal(searchParams?.type?.exportName, "URLSearchParams");
  assert.equal(pathToFileURL?.signatures?.[0]?.id, "node:url.pathToFileURL(System.String)");
  assert.equal(format?.signatures?.[0]?.id, "node:url.format(Tsonic.CSharp.Node.URL)");

  const constructorIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "url",
    exportName: "URL",
    memberName: "constructor",
    signatureId: "node:url.URL.constructor(System.String,System.String)",
  });
  const hrefIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "node:url",
    exportName: "URL",
    memberName: "href",
  });
  const pathIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "url",
    exportName: "pathToFileURL",
    signatureId: "node:url.pathToFileURL(System.String)",
  });
  const formatIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "url",
    exportName: "format",
    signatureId: "node:url.format(Tsonic.CSharp.Node.URL)",
  });
  const searchParamsIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "node:url",
    exportName: "URL",
    memberName: "searchParams",
  });
  const appendIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "url",
    exportName: "URLSearchParams",
    memberName: "append",
    signatureId: "node:url.URLSearchParams.append(System.String,System.String)",
  });
  assert.equal(constructorIdentity?.id, "Tsonic.CSharp.Node.URL..ctor(System.String,System.String)");
  assert.equal(hrefIdentity?.id, "Tsonic.CSharp.Node.URL.href");
  assert.equal(pathIdentity?.id, "Tsonic.CSharp.Node.url.pathToFileURL(System.String)");
  assert.equal(formatIdentity?.id, "Tsonic.CSharp.Node.url.format(System.Object)");
  assert.equal(searchParamsIdentity?.id, "Tsonic.CSharp.Node.URL.searchParams");
  assert.equal(appendIdentity?.id, "Tsonic.CSharp.Node.URLSearchParams.append(System.String,System.String)");
});

test("NodeJS provider package maps closed URL members from selected provider identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const constructorCall = {};
  const constructorSignature = {};
  const hrefExpression = {};
  const hrefDeclaration = {};
  const toStringCall = {};
  const toStringSignature = {};
  const pathToFileURLCall = {};
  const pathToFileURLSignature = {};
  const fileURLToPathCall = {};
  const fileURLToPathSignature = {};
  const searchParamsExpression = {};
  const searchParamsDeclaration = {};
  const appendCall = {};
  const appendSignature = {};
  facts.set(constructorSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:url",
    "URL",
    "constructor",
    "node:url.URL.constructor",
    "node:url.URL.constructor(System.String,System.String)",
  ));
  facts.set(hrefDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:url",
    "URL",
    "href",
    "node:url.URL.href",
  ));
  facts.set(toStringSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:url",
    "URL",
    "toString",
    "node:url.URL.toString",
    "node:url.URL.toString()",
  ));
  facts.set(pathToFileURLSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("url", "pathToFileURL", "node:url.pathToFileURL(System.String)"));
  facts.set(fileURLToPathSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:url", "fileURLToPath", "node:url.fileURLToPath(Tsonic.CSharp.Node.URL)"));
  facts.set(searchParamsDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:url",
    "URL",
    "searchParams",
    "node:url.URL.searchParams",
  ));
  facts.set(appendSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:url",
    "URLSearchParams",
    "append",
    "node:url.URLSearchParams.append",
    "node:url.URLSearchParams.append(System.String,System.String)",
  ));

  const constructorResult = provider.mapCheckedCall(nodejsCallRequest(constructorCall, constructorSignature), fakeContext(facts));
  const hrefResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(hrefExpression, hrefDeclaration), fakeContext(facts));
  const toStringResult = provider.mapCheckedCall(nodejsCallRequest(toStringCall, toStringSignature), fakeContext(facts));
  const pathToFileURLResult = provider.mapCheckedCall(nodejsCallRequest(pathToFileURLCall, pathToFileURLSignature), fakeContext(facts));
  const fileURLToPathResult = provider.mapCheckedCall(nodejsCallRequest(fileURLToPathCall, fileURLToPathSignature), fakeContext(facts));
  const searchParamsResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(searchParamsExpression, searchParamsDeclaration), fakeContext(facts));
  const appendResult = provider.mapCheckedCall(nodejsCallRequest(appendCall, appendSignature), fakeContext(facts));

  assert.equal(constructorResult.kind, "accept");
  assert.equal(constructorResult.value.selectedSignature.member.kind, "constructor");
  assert.equal(constructorResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.URL..ctor(System.String,System.String)");
  assert.equal(hrefResult.kind, "accept");
  assert.equal(hrefResult.value.operation.operationId, "Tsonic.CSharp.Node.URL.href");
  assert.equal(toStringResult.kind, "accept");
  assert.equal(toStringResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.URL.ToString()");
  assert.equal(pathToFileURLResult.kind, "accept");
  assert.equal(pathToFileURLResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.url.pathToFileURL(System.String)");
  assert.equal(pathToFileURLResult.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Node.URL");
  assert.equal(fileURLToPathResult.kind, "accept");
  assert.equal(fileURLToPathResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.url.fileURLToPath(Tsonic.CSharp.Node.URL)");
  assert.equal(searchParamsResult.kind, "accept");
  assert.equal(searchParamsResult.value.operation.operationId, "Tsonic.CSharp.Node.URL.searchParams");
  assert.equal(facts.get(searchParamsExpression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.URL.searchParams");
  assert.equal(appendResult.kind, "accept");
  assert.equal(appendResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.URLSearchParams.append(System.String,System.String)");
});

test("NodeJS provider package fails closed for unsupported URL provider identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const formatCall = {};
  const formatSignature = {};
  const urlPatternTestCall = {};
  const urlPatternTestSignature = {};
  const urlPatternExecCall = {};
  const urlPatternExecSignature = {};
  facts.set(formatSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:url", "format", "node:url.format(System.Object)"));
  facts.set(urlPatternTestSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:url",
    "URLPattern",
    "test",
    "node:url.URLPattern.test",
    "node:url.URLPattern.test(System.String)",
  ));
  facts.set(urlPatternExecSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:url",
    "URLPattern",
    "exec",
    "node:url.URLPattern.exec",
    "node:url.URLPattern.exec(System.String)",
  ));

  const formatResult = provider.mapCheckedCall(nodejsCallRequest(formatCall, formatSignature), fakeContext(facts));
  const urlPatternTestResult = provider.mapCheckedCall(nodejsCallRequest(urlPatternTestCall, urlPatternTestSignature), fakeContext(facts));
  const urlPatternExecResult = provider.mapCheckedCall(nodejsCallRequest(urlPatternExecCall, urlPatternExecSignature), fakeContext(facts));

  assert.equal(formatResult.kind, "reject");
  assert.equal(formatResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.match(formatResult.diagnostic.message, /node:url/);
  assert.match(formatResult.diagnostic.message, /format/);
  assert.equal(urlPatternTestResult.kind, "reject");
  assert.equal(urlPatternTestResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.match(urlPatternTestResult.diagnostic.message, /URLPattern/);
  assert.match(urlPatternTestResult.diagnostic.message, /test/);
  assert.equal(urlPatternTestResult.diagnostic.evidence?.[0]?.details?.targetIdentityId, "unsupported:Tsonic.CSharp.Node.URLPattern.test(System.String)");
  assert.equal(urlPatternExecResult.kind, "reject");
  assert.equal(urlPatternExecResult.diagnostic.extensionCode, "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED");
  assert.match(urlPatternExecResult.diagnostic.message, /URLPattern/);
  assert.match(urlPatternExecResult.diagnostic.message, /exec/);
  assert.equal(urlPatternExecResult.diagnostic.evidence?.[0]?.details?.targetIdentityId, "unsupported:Tsonic.CSharp.Node.URLPattern.exec(System.String)");
});

test("NodeJS provider package maps Buffer static calls from selected provider member signature identity", () => {
  const call = {};
  const selectedSignature = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "from",
    "node:buffer.Buffer.from",
    "node:buffer.Buffer.from(System.String,System.String)",
  ));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedSignature), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Node.Buffer.from(System.String,System.String)");
});

test("NodeJS provider package maps expanded Buffer static and instance calls from selected provider member identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const staticCall = {};
  const staticSignature = {};
  const instanceCall = {};
  const instanceSignature = {};
  facts.set(staticSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "isEncoding",
    "node:buffer.Buffer.isEncoding",
    "node:buffer.Buffer.isEncoding(System.String)",
  ));
  facts.set(instanceSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "equals",
    "node:buffer.Buffer.equals",
    "node:buffer.Buffer.equals(Tsonic.CSharp.Node.Buffer)",
  ));

  const staticResult = provider.mapCheckedCall(nodejsCallRequest(staticCall, staticSignature), fakeContext(facts));
  const instanceResult = provider.mapCheckedCall(nodejsCallRequest(instanceCall, instanceSignature), fakeContext(facts));

  assert.equal(staticResult.kind, "accept");
  assert.equal(staticResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.Buffer.isEncoding(System.String)");
  assert.equal(staticResult.value.selectedSignature.member.static, true);
  assert.equal(instanceResult.kind, "accept");
  assert.equal(instanceResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.Buffer.equals(Tsonic.CSharp.Node.Buffer)");
  assert.equal(instanceResult.value.selectedSignature.member.static, undefined);
});

test("NodeJS provider package maps Buffer numeric read and write calls from selected provider member identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const readCall = {};
  const readSignature = {};
  const writeCall = {};
  const writeSignature = {};
  facts.set(readSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "readUInt16LE",
    "node:buffer.Buffer.readUInt16LE",
    "node:buffer.Buffer.readUInt16LE(System.Int32)",
  ));
  facts.set(writeSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "writeDoubleBE",
    "node:buffer.Buffer.writeDoubleBE",
    "node:buffer.Buffer.writeDoubleBE(System.Double,System.Int32)",
  ));

  const readResult = provider.mapCheckedCall(nodejsCallRequest(readCall, readSignature), fakeContext(facts));
  const writeResult = provider.mapCheckedCall(nodejsCallRequest(writeCall, writeSignature), fakeContext(facts));

  assert.equal(readResult.kind, "accept");
  assert.equal(readResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.Buffer.readUInt16LE(System.Int32)");
  assert.equal(readResult.value.selectedSignature.member.returnType.name, "uint16");
  assert.equal(writeResult.kind, "accept");
  assert.equal(writeResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.Buffer.writeDoubleBE(System.Double,System.Int32)");
  assert.equal(writeResult.value.selectedSignature.member.returnType.name, "int32");
});

test("NodeJS provider package maps Buffer instance properties from selected provider member identity", () => {
  const expression = {};
  const selectedPropertySymbol = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedPropertySymbol, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "length",
    "node:buffer.Buffer.length",
  ));

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver: {},
    sourceSelectedSymbol: selectedPropertySymbol,
    propertyName: "not-the-selected-name",
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Node.Buffer.length");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.Buffer.length");
});

test("NodeJS provider package maps expanded static properties from selected provider declaration identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const pathExpression = {};
  const pathDeclaration = {};
  const processExpression = {};
  const processDeclaration = {};
  facts.set(pathDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "sep"));
  facts.set(processDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "argv"));

  const pathResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(pathExpression, pathDeclaration), fakeContext(facts));
  const processResult = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(processExpression, processDeclaration), fakeContext(facts));

  assert.equal(pathResult.kind, "accept");
  assert.equal(pathResult.value.operation.operationId, "Tsonic.CSharp.Node.path.sep");
  assert.equal(processResult.kind, "accept");
  assert.equal(processResult.value.operation.operationId, "Tsonic.CSharp.Node.process.argv");
  assert.equal(facts.get(processExpression, csharpTargetOperationFactKey)?.resultType.kind, "array");
  assert.equal(facts.get(processExpression, csharpTargetOperationFactKey)?.resultType.element.id, "System.String");
});

test("NodeJS provider package exposes process.env as provider-owned closed environment carrier", () => {
  const bindingProvider = createCsharpNodejsProviderPackageBindingProvider();
  const resolution = bindingProvider.resolveModule("process", {});
  assert.equal(resolution.kind, "virtual");
  const model = bindingProvider.getDeclarationModel(resolution);
  const env = model.exports.find((entry) => entry.name === "env");
  assert.equal(env?.kind, "value");
  assert.equal(env?.type.kind, "provider-ref");
  assert.equal(env?.type.exportName, "ProcessEnv");

  const envIdentity = bindingProvider.getTargetIdentity({
    moduleSpecifier: "process",
    exportName: "env",
  });
  assert.equal(envIdentity?.id, "Tsonic.CSharp.Node.process.env");

  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  const expression = {};
  const envDeclaration = {};
  facts.set(envDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "env"));

  const result = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(expression, envDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Node.process.env");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.process.env");
});

test("selected NodeJS provider package finalizes process metadata and environment operations", () => {
  const session = createCsharpSession(`
    import * as process from "node:process";

    export function processInfo(): string {
      const envPath = process.env["PATH"] ?? "";
      const usage = process.memoryUsage();
      return process.arch + process.argv0 + process.execPath + process.platform + process.version + process.versions.node + process.versions.dotnet + envPath + process.pid + process.ppid + process.uptime() + usage.rss + usage.heapUsed;
    }

    export function currentExitCode(): number | null {
      return process.exitCode;
    }

    export function changeDirectory(directory: string): void {
      process.chdir(directory);
    }

    export function terminate(code?: number): void {
      process.exit(code);
    }

    export function signalSelf(): boolean {
      return process.kill(process.pid, 0);
    }
  `, { selectedSurfaces: [{ id: "js" }], selectedPackages: [{ id: "nodejs" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const selectedMemberIds = collectFactValues(sourceFile, session, extensionHost, selectedTargetSignatureFactKey)
    .map((fact) => fact.member.id);
  const operationIds = collectFactValues(sourceFile, session, extensionHost, targetOperationFactKey)
    .map((fact) => fact.operationId);

  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.process.chdir(System.String)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.process.exit(System.Nullable`1)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.process.kill(System.Int32,System.Object)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.process.memoryUsage()"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Node.process.uptime()"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.arch"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.argv0"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.env"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.ProcessEnv.Item(System.String)"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.execPath"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.exitCode"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.pid"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.platform"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.ppid"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.version"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.process.versions"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.ProcessVersions.node"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.ProcessVersions.dotnet"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.MemoryUsage.rss"));
  assert.ok(operationIds.includes("Tsonic.CSharp.Node.MemoryUsage.heapUsed"));
});

test("NodeJS provider package rejects provider declarations whose selected identity is not mapped", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, {
    ...nodejsVirtualDeclaration("node:path", "join", "node:path.join(System.Int32)"),
  });

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_CALL_NOT_MAPPED");
});

test("NodeJS provider package rejects optional-arity calls without selected signature identity", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:crypto", "randomInt"));

  const result = provider.mapCheckedCall(nodejsCallRequestWithoutSignature(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_CALL_REQUIRES_SELECTED_SIGNATURE");
  assert.match(result.diagnostic.message, /randomInt/);
  assert.equal(result.diagnostic.evidence?.[0]?.details?.reason, "NodeJS provider-package calls require TSTS-selected provider signature identity before target member selection");
});

test("NodeJS provider package maps Buffer.isBuffer from selected provider member identity", () => {
  const call = {};
  const selectedSignature = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "isBuffer",
    "node:buffer.Buffer.isBuffer",
    "node:buffer.Buffer.isBuffer(System.Object)",
  ));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedSignature), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Node.Buffer.isBuffer(System.Object)");
});

test("NodeJS provider package rejects single-signature calls without selected signature identity", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "join"));

  const result = provider.mapCheckedCall(nodejsCallRequestWithoutSignature(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_CALL_REQUIRES_SELECTED_SIGNATURE");
  assert.match(result.diagnostic.message, /join/);
});

test("NodeJS provider package does not map foreign provider declarations by module and export name", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, {
    ...nodejsVirtualDeclaration("node:path", "join"),
    providerId: "foreign.nodejs-provider",
  });

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "defer");
});

test("NodeJS provider package maps static properties from the selected provider declaration identity", () => {
  const expression = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "platform"));

  const result = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(expression, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Node.process.platform");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.process.platform");
});

test("NodeJS provider package maps namespace property access from selected provider property symbol identity", () => {
  const expression = {};
  const selectedPropertySymbol = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(selectedPropertySymbol, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "platform"));

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver: {},
    sourceSelectedSymbol: selectedPropertySymbol,
    propertyName: "platform",
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Node.process.platform");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.process.platform");
});

test("NodeJS provider package defers namespace properties from import and property spelling alone", () => {
  const expression = {};
  const receiver = { Kind: "Identifier", Text: "process" };
  const sourceFile = namespaceImportSourceFile(receiver, "process", "node:process");
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver,
    receiverType: {},
    propertyName: "platform",
  }, fakeNamespaceImportContext(facts, sourceFile));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("NodeJS provider package defers namespace properties from container facts and property spelling", () => {
  const expression = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsProviderPackageOperationsProvider();
  facts.set(receiver, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "namespace"));

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver,
    receiverType: {},
    propertyName: "platform",
  }, fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

function arrayLengthRequest(expression, receiverType, sourceSelectedSymbol, options = {}) {
  const receiver = fakeNodeSubject(options.receiver ?? {});
  if (receiverType !== undefined) {
    receiver.SemanticType = receiverType;
  }
  return {
    target: "csharp",
    expression,
    receiver,
    receiverType,
    propertyName: "length",
    ...(sourceSelectedSymbol !== undefined ? { sourceSelectedSymbol } : {}),
  };
}

function arrayLengthDeclaration() {
  return arrayMemberDeclaration("length");
}

function arrayMemberDeclaration(memberName) {
  return sourceLibraryMemberDeclaration("Array", memberName);
}

function arrayConstructorDeclaration() {
  return sourceLibraryMemberDeclaration("ArrayConstructor", "");
}

function sourceLibraryMemberDeclaration(declaringName, memberName, fileName = "bundled:///libs/lib.es5.d.ts") {
  const sourceFile = { FileName: fileName };
  const arrayDeclaration = { Kind: 1, Name: { Text: declaringName }, SourceFile: sourceFile };
  return {
    Kind: 1,
    Name: { Text: memberName },
    Parent: arrayDeclaration,
    SourceFile: sourceFile,
  };
}

function namespaceImportSourceFile(receiver, localName, moduleSpecifier) {
  const sourceFile = { Kind: "SourceFile", Children: [] };
  receiver.SourceFile = sourceFile;
  sourceFile.Children = [{
    Kind: "ImportDeclaration",
    ImportClause: {
      Kind: "ImportClause",
      NamedBindings: {
        Kind: "NamespaceImport",
        Name: { Kind: "Identifier", Text: localName },
      },
    },
    ModuleSpecifier: { Kind: "StringLiteral", Text: `"${moduleSpecifier}"` },
    SourceFile: sourceFile,
  }];
  return sourceFile;
}

function fakeNamespaceImportContext(facts, sourceFile) {
  return {
    facts,
    factResolver: {
      resolve: () => undefined,
    },
    compiler: {
      ast: {
        is: fakeAstIs({
          IsIdentifier: (node) => node?.Kind === "Identifier",
          IsImportDeclaration: (node) => node?.Kind === "ImportDeclaration",
        }),
        kindName: (node) => typeof node?.Kind === "string" ? node.Kind : "",
        as: {
          AsImportDeclaration: (node) => node?.Kind === "ImportDeclaration" ? node : undefined,
          AsImportClause: (node) => node?.Kind === "ImportClause" ? node : undefined,
          AsNamespaceImport: (node) => node?.Kind === "NamespaceImport" ? node : undefined,
        },
        children: (node) => node?.Children ?? [],
        typeArguments: () => [],
        typeParameters: () => [],
        parameters: () => [],
        members: () => [],
        elements: () => [],
        properties: () => [],
        arguments: () => [],
        getSourceFile: (node) => node?.SourceFile ?? (node === sourceFile ? sourceFile : undefined),
        getFileName: (node) => node?.FileName ?? "",
        parent: (node) => node?.Parent,
        name: (node) => node?.Name,
        text: (node) => node?.Text ?? "",
      },
      checker: {
        getSignatureDeclaration: (signature) => signature?.declaration,
        getSymbolDeclarations: () => [],
        getTypeAtLocation: () => undefined,
        getTypeSymbol: () => undefined,
        getSymbolAtLocation: () => undefined,
        getResolvedSymbolOrNil: () => undefined,
        getResolvedSymbol: () => undefined,
        getAliasedSymbol: () => undefined,
      },
    },
  };
}

function sourceLibraryPropertyRequest(expression, sourceSelectedSymbol, propertyName, options = {}) {
  const receiver = fakeNodeSubject(options.receiver ?? {});
  if (options.receiverType !== undefined) {
    receiver.SemanticType = options.receiverType;
  }
  return {
    target: "csharp",
    expression,
    receiver,
    receiverType: options.receiverType ?? {},
    propertyName,
    sourceSelectedSymbol,
  };
}

function fakeNodeSubject(subject, kind = "Identifier") {
  if (subject !== undefined && subject !== null && typeof subject === "object" && subject.Kind === undefined) {
    subject.Kind = kind;
  }
  return subject;
}

function fakeHost(receiverType, targetTypes = new Map(), targetBinding, objectShapeFacts = new Map()) {
  return {
    ...(targetBinding === undefined ? {} : { getCsharpTargetBindingByTargetId: (targetId) => targetId === targetBinding.id ? targetBinding : undefined }),
    ...(targetBinding === undefined ? {} : { getCsharpTargetBindingByMetadataName: (metadataName) => metadataName === "System.Collections.Generic.Dictionary`2" ? targetBinding : undefined }),
    getTargetTypeRefForSubject: (subject, context) => targetTypes.get(subject) ??
      context?.factResolver?.resolve(subject, runtimeCarrierFactKey)?.carrier ??
      context?.factResolver?.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
      (receiverType !== undefined && subject === receiverType
      ? { kind: "array", element: { kind: "source-primitive", name: "int32" } }
      : undefined),
    getCsharpObjectShapeFactForSubject: (subject) => objectShapeFacts.get(subject),
    mapRuntimeCarrier: () => ({ kind: "defer" }),
  };
}

function fakeContext(facts) {
  return {
    facts,
    factResolver: {
      resolve: (subject, key) => facts.get(subject, key),
    },
    compiler: {
      ast: {
        is: fakeAstIs({
          IsIdentifier: (node) => node?.Kind === "Identifier",
          IsPrivateIdentifier: (node) => node?.Kind === "PrivateIdentifier",
          IsQualifiedName: (node) => node?.Kind === "QualifiedName",
          IsPropertyAccessExpression: (node) => node?.Kind === "PropertyAccessExpression",
          IsVariableDeclaration: (node) => node?.Kind === "VariableDeclaration",
          IsParameterDeclaration: (node) => node?.Kind === "ParameterDeclaration",
          IsBindingElement: (node) => node?.Kind === "BindingElement",
          IsFunctionDeclaration: (node) => node?.Kind === "FunctionDeclaration",
          IsClassDeclaration: (node) => node?.Kind === "ClassDeclaration",
          IsMethodDeclaration: (node) => node?.Kind === "MethodDeclaration",
          IsPropertyDeclaration: (node) => node?.Kind === "PropertyDeclaration",
          IsTypeReferenceNode: (node) => node?.Kind === "TypeReferenceNode",
          IsTypeParameterDeclaration: (node) => node?.Kind === "TypeParameterDeclaration",
          IsTypeAliasDeclaration: (node) => node?.Kind === "TypeAliasDeclaration",
          IsInterfaceDeclaration: (node) => node?.Kind === "InterfaceDeclaration",
          IsImportTypeNode: (node) => node?.Kind === "ImportTypeNode",
        }),
        kindName: (node) => typeof node?.Kind === "string" ? node.Kind : "",
        getSourceFile: (node) => node?.SourceFile,
        getFileName: (sourceFile) => sourceFile?.FileName ?? "",
        parent: (node) => node?.Parent,
        name: (node) => node?.Name,
        text: (node) => node?.Text ?? "",
      },
      checker: {
        getSignatureDeclaration: (signature) => signature?.declaration,
        getSymbolDeclarations: (symbol) =>
          symbol?.declarations ??
          (symbol?.declaration !== undefined
            ? [symbol.declaration]
            : symbol?.Kind !== undefined
            ? [symbol]
            : []),
        getTypeAtLocation: (node) => node?.SemanticType,
        getTypeSymbol: () => undefined,
        getSymbolAtLocation: () => undefined,
        getResolvedSymbolOrNil: () => undefined,
        getResolvedSymbol: () => undefined,
        getAliasedSymbol: () => undefined,
      },
      typeShape: {
        isNullish: (type) => type?.kind === "test-nullish",
      },
    },
  };
}

function fakeAstIs(overrides = {}) {
  return new Proxy(overrides, {
    get(target, property) {
      if (property in target) {
        return target[property];
      }
      return () => false;
    },
  });
}

function createCsharpSession(sourceText, options = {}) {
  const target = {
    id: "csharp",
    ...(options.typescriptCompatibility === undefined ? {} : { options: { typescriptCompatibility: options.typescriptCompatibility } }),
  };
  const selectedPackages = selectedProviderPackages(options.selectedPackages ?? []);
  const context = {
    project: {
      entryPoint: "index.ts",
      targets: [target],
    },
    target,
    selectedSurfaces: options.selectedSurfaces ?? [],
    selectedPackages,
  };
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
      target: "es2022",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createTsonicCoreSourceExtension(),
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
        ...context.selectedSurfaces.flatMap((surface) =>
          surface.id === "js"
            ? [createCsharpJsSurfaceExtension({ ...context, surface, targetPack: fakeTargetPack })]
            : []
        ),
        ...context.selectedPackages.flatMap((providerPackage) =>
          providerPackage.createExtensions?.({ ...context, package: providerPackage, targetPack: fakeTargetPack }) ?? []
        ),
      ],
    },
  });
}

function selectedProviderPackages(requestedPackages) {
  return requestedPackages.map((providerPackage) =>
    providerPackage.id === nodejsTestProviderPackage.id
      ? nodejsTestProviderPackage
      : providerPackage
  );
}

const nodejsTestProviderPackage = {
  id: "nodejs",
  displayName: "Node.js provider package",
  requiredSurfaces: ["js"],
  createCsharpOperationsMappers: createCsharpNodejsProviderPackageOperationsMappers,
  createExtensions(context) {
    return [createCsharpNodejsProviderPackageExtension(context)];
  },
};

const fakeTargetPack = {
  id: "csharp",
  displayName: "C#",
};

function collectNodesByKind(node, ast, kindName, result = []) {
  if (node === undefined) {
    return result;
  }
  if (ast.kindName(node) === kindName) {
    result.push(node);
  }
  for (const child of ast.children(node) ?? []) {
    collectNodesByKind(child, ast, kindName, result);
  }
  return result;
}

function collectFactValues(sourceFile, session, extensionHost, factKey) {
  return collectAllNodes(sourceFile, session.ast)
    .map((node) => extensionHost.facts.get(node, factKey))
    .filter((fact) => fact !== undefined);
}

function collectAllNodes(node, ast, result = []) {
  if (node === undefined) {
    return result;
  }
  result.push(node);
  for (const child of ast.children(node) ?? []) {
    collectAllNodes(child, ast, result);
  }
  return result;
}

function jsCallRequest(call, sourceSelectedDeclaration, options = {}) {
  const callee = fakeCallCallee(options);
  return {
    target: "csharp",
    call: fakeNodeSubject(call, call?.Kind ?? "CallExpression"),
    callee,
    arguments: (options.arguments ?? []).map((argument) => fakeNodeSubject(argument)),
    sourceSelectedDeclaration,
    sourceSelectedSignature: options.sourceSelectedSignature ?? selectedSourceLibrarySignature(sourceSelectedDeclaration),
  };
}

function jsCallRequestWithoutSignature(call, sourceSelectedDeclaration, options = {}) {
  const callee = fakeCallCallee(options);
  return {
    target: "csharp",
    call: fakeNodeSubject(call, call?.Kind ?? "CallExpression"),
    callee,
    arguments: (options.arguments ?? []).map((argument) => fakeNodeSubject(argument)),
    sourceSelectedDeclaration,
  };
}

function fakeCallCallee(options = {}) {
  if (options.callee !== undefined) {
    return fakeNodeSubject(options.callee, options.callee.Kind ?? "Identifier");
  }
  if (options.calleeReceiver === undefined) {
    return fakeNodeSubject({}, "Identifier");
  }
  return {
    Kind: "PropertyAccessExpression",
    Expression: fakeNodeSubject(options.calleeReceiver),
    Name: { Kind: "Identifier", Text: "member" },
  };
}

function selectedSourceLibrarySignature(sourceSelectedDeclaration) {
  return { declaration: sourceSelectedDeclaration };
}

function nodejsCallRequest(call, sourceSelectedSignature) {
  return {
    target: "csharp",
    call,
    callee: {},
    arguments: [],
    sourceSelectedSignature,
  };
}

function nodejsCallRequestWithoutSignature(call, sourceSelectedDeclaration) {
  return {
    target: "csharp",
    call,
    callee: {},
    arguments: [],
    sourceSelectedDeclaration,
  };
}

function nodejsPropertyRequest(expression, sourceSelectedSymbol) {
  return {
    target: "csharp",
    expression,
    receiver: {},
    receiverType: {},
    propertyName: "platform",
    sourceSelectedSymbol,
  };
}

function nodejsVirtualDeclaration(moduleSpecifier, exportName, signatureId) {
  return {
    providerId: "tsonic.csharp.provider-package.nodejs",
    providerVersion: "0.0.1",
    providerModuleId: moduleSpecifier,
    moduleSpecifier,
    virtualFileName: `tsts-provider://csharp-nodejs/${encodeURIComponent(moduleSpecifier)}.d.ts`,
    exportName,
    ...(signatureId !== undefined ? { signatureId } : {}),
  };
}

function nodejsVirtualMemberDeclaration(moduleSpecifier, exportName, memberName, memberId, signatureId) {
  return {
    ...nodejsVirtualDeclaration(moduleSpecifier, exportName),
    memberName,
    memberId,
    ...(signatureId !== undefined ? { signatureId } : {}),
  };
}

function int32Type() {
  return { kind: "source-primitive", name: "int32" };
}

function float64Type() {
  return { kind: "source-primitive", name: "float64" };
}

function boolType() {
  return { kind: "source-primitive", name: "bool" };
}

function nullishType() {
  return { kind: "test-nullish" };
}

function stringType() {
  return {
    kind: "target-named",
    id: "System.String",
    csharpRender: { kind: "predefined", name: "string" },
    csharpSpecialType: "string",
    csharpTypeofRuntimeKind: "string",
  };
}

function regexpType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.RegExp",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "RegExp" },
    csharpJsSurfaceKind: "regexp",
  };
}

function dateType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.Date",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "Date" },
    csharpJsSurfaceKind: "date",
  };
}

function jsObjectType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.JSObject",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "JSObject" },
  };
}

function tsValueType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.TsValue",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "TsValue" },
  };
}

function jsArrayType(elementType) {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.JSArray`1",
    typeArguments: [elementType],
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "JSArray" },
    arrayLiteralElementType: elementType,
    csharpEnumerableElementType: elementType,
    csharpReadOnlyIndexableElementType: elementType,
  };
}

function jsMapType(keyType, valueType) {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.Map`2",
    typeArguments: [keyType, valueType],
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "Map" },
    csharpEnumerableElementType: { kind: "tuple", elements: [keyType, valueType] },
    csharpJsSurfaceKind: "map",
  };
}

function jsSetType(elementType) {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.Set`1",
    typeArguments: [elementType],
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "Set" },
    csharpEnumerableElementType: elementType,
    csharpJsSurfaceKind: "set",
  };
}

function int32ArrayType() {
  return { kind: "array", element: int32Type() };
}

function int32EnumerableType() {
  return genericSystemCollectionType("IEnumerable", int32Type(), {
    csharpArrayLiteralElementType: int32Type(),
    csharpEnumerableElementType: int32Type(),
  });
}

function int32ReadOnlyListType() {
  return genericSystemCollectionType("IReadOnlyList", int32Type(), {
    csharpArrayLiteralElementType: int32Type(),
    csharpEnumerableElementType: int32Type(),
    csharpReadOnlyIndexableElementType: int32Type(),
  });
}

function genericSystemCollectionType(name, elementType, extras = {}) {
  return {
    kind: "target-named",
    id: `System.Collections.Generic.${name}\`1`,
    typeArguments: [elementType],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name },
    ...extras,
  };
}

function recordDictionaryType(keyType, valueType) {
  return {
    kind: "target-named",
    id: "System.Collections.Generic.Dictionary`2",
    typeArguments: [keyType, valueType],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary" },
    csharpCollectionSurface: "record",
  };
}

function surfaceObjectShapeFact(name, members) {
  return {
    targetType: {
      kind: "target-named",
      id: `Test.${name}`,
      csharpRender: { kind: "named", namespace: ["Test"], name },
    },
    members,
  };
}

function dictionaryBinding() {
  const declarationType = {
    kind: "target-named",
    id: "System.Collections.Generic.Dictionary`2",
    typeArguments: [{ kind: "type-parameter", name: "TKey" }, { kind: "type-parameter", name: "TValue" }],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary" },
  };
  return {
    target: "csharp",
    id: "System.Collections.Generic.Dictionary`2",
    typeParameters: [{ name: "TKey" }, { name: "TValue" }],
    csharpType: declarationType,
    members: [{
      id: "System.Collections.Generic.Dictionary`2.Item(TKey)",
      sourceName: "item",
      targetName: "Item",
      kind: "indexer",
      declaringType: declarationType,
      parameters: [{ name: "key", type: { kind: "type-parameter", name: "TKey" }, passingMode: "by-value" }],
      returnType: { kind: "type-parameter", name: "TValue" },
      overloadGroup: "System.Collections.Generic.Dictionary`2.Item(TKey)",
    }, {
      id: "System.Collections.Generic.Dictionary`2.Keys",
      sourceName: "keys",
      targetName: "Keys",
      kind: "property",
      declaringType: declarationType,
      parameters: [],
      returnType: {
        kind: "target-named",
        id: "System.Collections.Generic.Dictionary`2.KeyCollection",
        typeArguments: [{ kind: "type-parameter", name: "TKey" }, { kind: "type-parameter", name: "TValue" }],
        csharpRender: { kind: "nested", outer: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary" }, name: "KeyCollection" },
      },
    }],
  };
}

function actionOfInt32Type() {
  return {
    kind: "target-named",
    id: "System.Action`1",
    typeArguments: [int32Type()],
  };
}

function funcInt32ToStringType() {
  return {
    kind: "target-named",
    id: "System.Func`2",
    typeArguments: [int32Type(), stringType()],
    csharpDelegateSignature: {
      parameters: [int32Type()],
      returnType: stringType(),
    },
  };
}

class TestFactStore {
  #facts = new Map();

  get(subject, key) {
    return this.#facts.get(subject)?.get(key);
  }

  set(subject, key, value) {
    let subjectFacts = this.#facts.get(subject);
    if (subjectFacts === undefined) {
      subjectFacts = new Map();
      this.#facts.set(subject, subjectFacts);
    }
    subjectFacts.set(key, value);
  }
}
