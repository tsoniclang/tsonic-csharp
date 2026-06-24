import { test } from "node:test";
import assert from "node:assert/strict";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { csharpTargetIterationFactKey, csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { createCsharpJsSurfaceOperationsProvider, createCsharpNativeOperationsProvider, createCsharpNodejsSurfaceOperationsProvider } from "../dist/source/csharp-source-semantics/operations-provider.js";

test("Array.length is not mapped without the JS surface", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpNativeOperationsProvider(fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, arrayLengthDeclaration()), fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("JS surface maps Array.length only from the selected standard-library declaration", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, arrayLengthDeclaration()), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.js.Array.length");
});

test("native provider does not map JS Object, JSON, or console surface operations", () => {
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
  assert.equal(consoleResult.kind, "defer");
  assert.equal(facts.get(objectCall, csharpTargetOperationFactKey), undefined);
  assert.equal(facts.get(jsonCall, csharpTargetOperationFactKey), undefined);
  assert.equal(facts.get(consoleExpression, csharpTargetOperationFactKey), undefined);
});

test("JS surface does not map Array.length from receiver carrier without selected declaration", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, undefined), fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("JS surface does not recover Array.length from property text without a finalized receiver carrier", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, undefined), fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("JS surface rejects selected Array.length without finalized array receiver facts", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, arrayLengthDeclaration()), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Array\.length/);
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("JS surface maps single-target calls from selected declaration identity without selected signature identity", () => {
  const call = {};
  const receiver = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ArrayType()],
    [value, int32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, arrayMemberDeclaration("includes"), {
    arguments: [value],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Runtime.ArrayHelpers.includes");
});

test("JS surface maps Array.concat from selected declaration and closed array argument facts", () => {
  const call = {};
  const receiver = {};
  const values = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ArrayType()],
    [values, int32ArrayType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, arrayMemberDeclaration("concat"), {
    arguments: [values],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Runtime.ArrayHelpers.concat");
  assert.equal(result.value.selectedSignature.member.returnType.kind, "array");
  assert.equal(result.value.selectedSignature.member.returnType.element.name, "int32");
});

test("JS surface rejects Array.concat without closed array argument facts", () => {
  const call = {};
  const receiver = {};
  const values = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ArrayType()],
    [values, stringType()],
  ]);
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

test("JS surface rejects Math.max without provider-proven runtime-compatible arguments", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Math", "max")), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
});

test("JS surface rejects multi-target calls without exact selected signature identity", () => {
  const call = {};
  const receiver = {};
  const callback = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ArrayType()],
    [callback, actionOfInt32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, arrayMemberDeclaration("forEach"), {
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
  const selectedSignature = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [receiver, int32ArrayType()],
    [callback, actionOfInt32Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, arrayMemberDeclaration("forEach"), {
    arguments: [callback],
    calleeReceiver: receiver,
    sourceSelectedSignature: selectedSignature,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Runtime.ArrayHelpers.forEach:1");
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
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Object\.keys/);
});

test("JS surface hard-rejects JSON operations until closed JSON carrier facts exist", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "parse")), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED");
  assert.match(result.diagnostic.message, /JSON\.parse/);
});

test("JS surface hard-rejects JSON.stringify until a closed JSON value carrier is modeled", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED");
  assert.match(result.diagnostic.message, /JSON\.stringify/);
});

test("JS surface defers method-valued console property access to selected call facts", () => {
  const expression = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("Console", "log"), "log"), fakeContext(facts));

  assert.equal(result.kind, "defer");
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

test("JS surface rejects console.dirxml when selected arguments do not match runtime shape", () => {
  const call = {};
  const first = {};
  const second = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [first, stringType()],
    [second, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "dirxml"), {
    arguments: [first, second],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_CONSOLE_ARGUMENT_REQUIRES_TARGET_FACT");
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
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_CONSOLE_ARGUMENT_REQUIRES_TARGET_FACT");
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
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.keys");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.kind, "array");
  assert.equal(result.value.selectedSignature.member.returnType.element.id, "System.String");
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
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.values");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.kind, "array");
  assert.equal(result.value.selectedSignature.member.returnType.element.id, "System.Object");
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
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.entries");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.kind, "array");
  assert.equal(result.value.selectedSignature.member.returnType.element.kind, "tuple");
  assert.equal(result.value.selectedSignature.member.returnType.element.elements[0].id, "System.String");
  assert.equal(result.value.selectedSignature.member.returnType.element.elements[1].id, "System.Object");
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

test("JS surface hard-rejects unsupported Object calls and property-valued access", () => {
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));
  const call = {};
  const expression = {};

  const callResult = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "assign"), {
    arguments: [{}, {}],
  }), fakeContext(facts));
  const propertyResult = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("ObjectConstructor", "assign"), "assign"), fakeContext(facts));

  assert.equal(callResult.kind, "reject");
  assert.equal(callResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(callResult.diagnostic.message, /Object\.assign/);
  assert.equal(propertyResult.kind, "reject");
  assert.equal(propertyResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(propertyResult.diagnostic.message, /Object\.assign/);
});

test("JS surface does not map console or Object calls without selected declarations", () => {
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const consoleResult = provider.mapCheckedCall(jsCallRequest({}, undefined), fakeContext(facts));
  const objectResult = provider.mapCheckedCall(jsCallRequest({}, undefined, { arguments: [{}] }), fakeContext(facts));

  assert.equal(consoleResult.kind, "defer");
  assert.equal(objectResult.kind, "defer");
});

test("JS surface hard-rejects selected RegExp calls without target runtime facts", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("RegExp", "exec")), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(result.diagnostic.message, /RegExp\.exec/);
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

test("JS surface does not reject Object, JSON, or console by source spelling outside bundled declarations", () => {
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
  const receiverType = {};
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
    receiver: {},
    receiverType,
    argument: key,
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationKind, "indexer");
  assert.equal(result.value.operation.targetOperation, "Item");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationKind, "indexer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.memberName, "Item");
});

test("JS surface maps Record for-in through provider-owned Dictionary key facts", () => {
  const statement = {};
  const expression = {};
  const expressionType = {};
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

test("JS surface rejects Record for-in without string-key enumeration facts", () => {
  const statement = {};
  const expression = {};
  const expressionType = {};
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

test("NodeJS surface maps calls from the selected provider signature identity", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "join", "node:path.join(System.String[])"));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Node.path.join(System.String[])");
});

test("NodeJS surface maps expanded path and fs calls from selected provider signature identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
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

test("NodeJS surface maps expanded crypto and os calls from selected provider signature identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  const cryptoCall = {};
  const cryptoSignature = {};
  const osCall = {};
  const osSignature = {};
  facts.set(cryptoSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:crypto", "randomInt", "node:crypto.randomInt(System.Int32,System.Int32)"));
  facts.set(osSignature, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:os", "tmpdir", "node:os.tmpdir()"));

  const cryptoResult = provider.mapCheckedCall(nodejsCallRequest(cryptoCall, cryptoSignature), fakeContext(facts));
  const osResult = provider.mapCheckedCall(nodejsCallRequest(osCall, osSignature), fakeContext(facts));

  assert.equal(cryptoResult.kind, "accept");
  assert.equal(cryptoResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.crypto.randomInt(System.Int32,System.Int32)");
  assert.equal(osResult.kind, "accept");
  assert.equal(osResult.value.selectedSignature.member.id, "Tsonic.CSharp.Node.os.tmpdir()");
});

test("NodeJS surface maps Buffer static calls from selected provider member signature identity", () => {
  const call = {};
  const selectedSignature = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
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

test("NodeJS surface maps expanded Buffer static and instance calls from selected provider member identities", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
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

test("NodeJS surface maps Buffer instance properties from selected provider member identity", () => {
  const expression = {};
  const selectedPropertySymbol = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
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
    sourceSelectedPropertySymbol: selectedPropertySymbol,
    propertyName: "not-the-selected-name",
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Node.Buffer.length");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.Buffer.length");
});

test("NodeJS surface maps expanded static properties from selected provider declaration identity", () => {
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
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

test("NodeJS surface rejects provider declarations whose selected identity is not mapped", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, {
    ...nodejsVirtualDeclaration("node:path", "join"),
    virtualFileName: "tsts-provider://csharp-nodejs/wrong.d.ts",
  });

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_CALL_NOT_MAPPED");
});

test("NodeJS surface rejects overloaded provider declarations without selected signature identity", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:crypto", "randomInt"));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /node:crypto/);
  assert.match(result.diagnostic.message, /randomInt/);
});

test("NodeJS surface rejects selected provider members absent from the explicit surface map", () => {
  const call = {};
  const selectedSignature = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  facts.set(selectedSignature, providerVirtualDeclarationFactKey, nodejsVirtualMemberDeclaration(
    "node:buffer",
    "Buffer",
    "isBuffer",
    "node:buffer.Buffer.isBuffer",
    "node:buffer.Buffer.isBuffer(System.Object)",
  ));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedSignature), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_NODEJS_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /member 'isBuffer'/);
  assert.match(result.diagnostic.message, /node:buffer\.Buffer\.isBuffer/);
});

test("NodeJS surface maps single-signature calls from provider declaration identity", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "join"));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Node.path.join(System.String[])");
});

test("NodeJS surface does not map foreign provider declarations by module and export name", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, {
    ...nodejsVirtualDeclaration("node:path", "join"),
    providerId: "foreign.nodejs-provider",
  });

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "defer");
});

test("NodeJS surface maps static properties from the selected provider declaration identity", () => {
  const expression = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "platform"));

  const result = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(expression, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Node.process.platform");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.process.platform");
});

test("NodeJS surface maps namespace property access from selected provider property symbol identity", () => {
  const expression = {};
  const selectedPropertySymbol = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
  facts.set(selectedPropertySymbol, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "platform"));

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver: {},
    sourceSelectedPropertySymbol: selectedPropertySymbol,
    propertyName: "platform",
  }, fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Node.process.platform");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.process.platform");
});

test("NodeJS surface does not map namespace properties from import and property spelling alone", () => {
  const expression = {};
  const receiver = { Kind: "Identifier", Text: "process" };
  const sourceFile = namespaceImportSourceFile(receiver, "process", "node:process");
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();

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

test("NodeJS surface does not map namespace properties from container facts and property spelling", () => {
  const expression = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpNodejsSurfaceOperationsProvider();
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

function arrayLengthRequest(expression, receiverType, sourceSelectedDeclaration) {
  return {
    target: "csharp",
    expression,
    receiver: {},
    receiverType,
    propertyName: "length",
    ...(sourceSelectedDeclaration !== undefined ? { sourceSelectedDeclaration } : {}),
  };
}

function arrayLengthDeclaration() {
  return arrayMemberDeclaration("length");
}

function arrayMemberDeclaration(memberName) {
  return sourceLibraryMemberDeclaration("Array", memberName);
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
        is: {
          IsIdentifier: (node) => node?.Kind === "Identifier",
          IsImportDeclaration: (node) => node?.Kind === "ImportDeclaration",
        },
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
    },
  };
}

function sourceLibraryPropertyRequest(expression, sourceSelectedDeclaration, propertyName, options = {}) {
  return {
    target: "csharp",
    expression,
    receiver: {},
    receiverType: options.receiverType ?? {},
    propertyName,
    sourceSelectedDeclaration,
  };
}

function fakeHost(receiverType, targetTypes = new Map(), targetBinding) {
  return {
    ...(targetBinding === undefined ? {} : { getCsharpTargetBindingByTargetId: (targetId) => targetId === targetBinding.id ? targetBinding : undefined }),
    ...(targetBinding === undefined ? {} : { getCsharpTargetBindingByMetadataName: (metadataName) => metadataName === "System.Collections.Generic.Dictionary`2" ? targetBinding : undefined }),
    getTargetTypeRefForSubject: (subject) => targetTypes.get(subject) ?? (subject === receiverType
      ? { kind: "array", element: { kind: "source-primitive", name: "int32" } }
      : undefined),
    getCsharpObjectShapeFactForSubject: () => undefined,
    mapRuntimeCarrier: () => ({ kind: "defer" }),
  };
}

function fakeContext(facts) {
  return {
    facts,
    factResolver: {
      resolve: () => undefined,
    },
    compiler: {
      ast: {
        getSourceFile: (node) => node?.SourceFile,
        getFileName: (sourceFile) => sourceFile?.FileName ?? "",
        parent: (node) => node?.Parent,
        name: (node) => node?.Name,
        text: (node) => node?.Text ?? "",
      },
    },
  };
}

function jsCallRequest(call, sourceSelectedDeclaration, options = {}) {
  return {
    target: "csharp",
    call,
    callee: {},
    arguments: options.arguments ?? [],
    sourceSelectedDeclaration,
    ...(options.calleeReceiver !== undefined ? { calleeReceiver: options.calleeReceiver } : {}),
    ...(options.sourceSelectedSignature !== undefined ? { sourceSelectedSignature: options.sourceSelectedSignature } : {}),
  };
}

function nodejsCallRequest(call, sourceSelectedDeclaration) {
  return {
    target: "csharp",
    call,
    callee: {},
    arguments: [],
    sourceSelectedDeclaration,
  };
}

function nodejsPropertyRequest(expression, sourceSelectedDeclaration) {
  return {
    target: "csharp",
    expression,
    receiver: {},
    receiverType: {},
    propertyName: "platform",
    sourceSelectedDeclaration,
  };
}

function nodejsVirtualDeclaration(moduleSpecifier, exportName, signatureId) {
  return {
    providerId: "tsonic.csharp.nodejs-surface-provider",
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

function stringType() {
  return {
    kind: "target-named",
    id: "System.String",
    csharpRender: { kind: "predefined", name: "string" },
    csharpSpecialType: "string",
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

function jsObjectType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.JSObject",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "JSObject" },
  };
}

function int32ArrayType() {
  return { kind: "array", element: int32Type() };
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
