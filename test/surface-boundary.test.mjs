import { test } from "node:test";
import assert from "node:assert/strict";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { createCsharpOperationsProvider } from "../dist/source/csharp-source-semantics/operations-provider.js";

test("Array.length is not mapped without the JS surface", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpOperationsProvider(new Set(), fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, arrayLengthDeclaration()), fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("JS surface maps Array.length only from the selected standard-library declaration", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpOperationsProvider(new Set(["js"]), fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, arrayLengthDeclaration()), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.js.Array.length");
});

test("JS surface does not map Array.length from receiver carrier without selected declaration", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpOperationsProvider(new Set(["js"]), fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, undefined), fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("JS surface does not recover Array.length from property text without a finalized receiver carrier", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpOperationsProvider(new Set(["js"]), fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, undefined), fakeContext(facts));

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});

test("NodeJS surface maps calls from the selected provider signature identity", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpOperationsProvider(new Set(["nodejs"]), fakeHost(undefined));
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "join", "node:path.join(System.String[])"));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Node.path.join(System.String[])");
});

test("NodeJS surface rejects provider declarations whose selected identity is not mapped", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpOperationsProvider(new Set(["nodejs"]), fakeHost(undefined));
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
  const provider = createCsharpOperationsProvider(new Set(["nodejs"]), fakeHost(undefined));
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:path", "join"));

  const result = provider.mapCheckedCall(nodejsCallRequest(call, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Node.path.join(System.String[])");
});

test("NodeJS surface does not map foreign provider declarations by module and export name", () => {
  const call = {};
  const selectedDeclaration = {};
  const facts = new TestFactStore();
  const provider = createCsharpOperationsProvider(new Set(["nodejs"]), fakeHost(undefined));
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
  const provider = createCsharpOperationsProvider(new Set(["nodejs"]), fakeHost(undefined));
  facts.set(selectedDeclaration, providerVirtualDeclarationFactKey, nodejsVirtualDeclaration("node:process", "platform"));

  const result = provider.mapCheckedPropertyAccess(nodejsPropertyRequest(expression, selectedDeclaration), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Tsonic.CSharp.Node.process.platform");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Node.process.platform");
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
  const sourceFile = { FileName: "bundled:///libs/lib.es5.d.ts" };
  const arrayDeclaration = { Kind: 1, Name: { Text: "Array" }, SourceFile: sourceFile };
  return {
    Kind: 1,
    Name: { Text: "length" },
    Parent: arrayDeclaration,
    SourceFile: sourceFile,
  };
}

function fakeHost(receiverType) {
  return {
    getTargetTypeRefForSubject: (subject) => subject === receiverType
      ? { kind: "array", element: { kind: "source-primitive", name: "int32" } }
      : undefined,
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
