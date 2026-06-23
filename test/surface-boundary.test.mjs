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

test("JS surface hard-rejects Object operations until closed Object carrier facts exist", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "keys")), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED");
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

test("JS surface hard-rejects console operations until closed console facts exist", () => {
  const expression = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("Console", "log"), "log"), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED");
  assert.match(result.diagnostic.message, /Console\.log/);
});

test("JS surface hard-rejects console calls until closed console facts exist", () => {
  const call = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "log")), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED");
  assert.match(result.diagnostic.message, /Console\.log/);
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

function sourceLibraryPropertyRequest(expression, sourceSelectedDeclaration, propertyName) {
  return {
    target: "csharp",
    expression,
    receiver: {},
    receiverType: {},
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

function int32Type() {
  return { kind: "source-primitive", name: "int32" };
}

function stringType() {
  return {
    kind: "target-named",
    id: "System.String",
    csharpRender: { kind: "predefined", name: "string" },
    csharpSpecialType: "string",
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
