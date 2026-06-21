import { test } from "node:test";
import assert from "node:assert/strict";
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

test("JS surface does not recover Array.length from receiver type and property text", () => {
  const expression = {};
  const receiverType = {};
  const facts = new TestFactStore();
  const provider = createCsharpOperationsProvider(new Set(["js"]), fakeHost(receiverType));

  const result = provider.mapCheckedPropertyAccess(arrayLengthRequest(expression, receiverType, undefined), fakeContext(facts));

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
