import { test } from "node:test";
import assert from "node:assert/strict";
import { selectedTargetSignatureFactKey } from "@tsonic/tsts";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { recordCsharpSelectedCallOperationFactsBeforeFinalization } from "../dist/source/csharp-source-semantics/csharp-operation-lifecycle.js";

test("selected call lifecycle records closed C# operation facts from selected type arguments", () => {
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [] } };
  const call = { Kind: 1 };
  sourceFile.Statements.Nodes.push(call);
  const member = genericIdentityMember();
  const facts = new TestFactStore();
  facts.set(call, selectedTargetSignatureFactKey, {
    member,
    targetTypeArguments: [csharpStringTargetType()],
  });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedCallOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost());

  const operation = facts.get(call, csharpTargetOperationFactKey);
  assert.equal(operation.kind, "member");
  assert.equal(operation.operationId, "Example.Box.identity``1");
  assert.deepEqual(operation.resultType, csharpStringTargetType());
  assert.deepEqual(operation.selectedMember.parameters[0].type, csharpStringTargetType());
  assert.deepEqual(operation.selectedMember.returnType, csharpStringTargetType());
});

test("selected call lifecycle does not record unresolved generic C# members", () => {
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [] } };
  const call = { Kind: 1 };
  sourceFile.Statements.Nodes.push(call);
  const facts = new TestFactStore();
  facts.set(call, selectedTargetSignatureFactKey, {
    member: genericIdentityMember(),
  });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedCallOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost());

  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});

test("selected call lifecycle does not synthesize first-argument receiver operations", () => {
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [] } };
  const call = { Kind: 1 };
  sourceFile.Statements.Nodes.push(call);
  const facts = new TestFactStore();
  facts.set(call, selectedTargetSignatureFactKey, {
    member: firstArgumentReceiverMember(),
  });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedCallOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost());

  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});

test("selected call lifecycle rejects mismatched selected type argument facts", () => {
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [] } };
  const call = { Kind: 1 };
  sourceFile.Statements.Nodes.push(call);
  const facts = new TestFactStore();
  facts.set(call, selectedTargetSignatureFactKey, {
    member: genericIdentityMember(),
    targetTypeArguments: [csharpStringTargetType(), csharpStringTargetType()],
  });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedCallOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost());

  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});

test("selected constructor lifecycle records explicit result type from declaring type", () => {
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [] } };
  const call = { Kind: 1 };
  sourceFile.Statements.Nodes.push(call);
  const declaringType = {
    kind: "target-named",
    id: "Example.Box",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Box" },
  };
  const facts = new TestFactStore();
  facts.set(call, selectedTargetSignatureFactKey, {
    member: {
      id: "Example.Box..ctor",
      sourceName: "Box",
      targetName: ".ctor",
      kind: "constructor",
      parameters: [],
      declaringType,
    },
  });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedCallOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost());

  const operation = facts.get(call, csharpTargetOperationFactKey);
  assert.equal(operation.kind, "member");
  assert.equal(operation.operationKind, "constructor");
  assert.deepEqual(operation.resultType, declaringType);
});

function genericIdentityMember() {
  return {
    id: "Example.Box.identity``1",
    sourceName: "identity",
    targetName: "Identity",
    kind: "method",
    parameters: [{
      name: "value",
      type: { kind: "type-parameter", name: "T" },
      passingMode: "by-value",
    }],
    returnType: { kind: "type-parameter", name: "T" },
    typeParameters: [{ name: "T" }],
  };
}

function csharpStringTargetType() {
  return {
    kind: "target-named",
    id: "System.String",
    csharpRender: { kind: "predefined", name: "string" },
    csharpSpecialType: "string",
    csharpTypeofRuntimeKind: "string",
  };
}

function firstArgumentReceiverMember() {
  const spanType = {
    kind: "target-named",
    id: "Example.Span`1",
    typeArguments: [{ kind: "source-primitive", name: "int32" }],
  };
  return {
    id: "Example.MemoryExtensions.Clear(Example.Span`1<System.Int32>)",
    sourceName: "clear",
    targetName: "Clear",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    declaringType: spanType,
    parameters: [
      {
        name: "span",
        type: spanType,
        passingMode: "by-value",
      },
    ],
    returnType: { kind: "source-primitive", name: "void" },
  };
}

function fakeCompiler(sourceFiles) {
  return {
    getSourceFiles: () => sourceFiles,
    ast: {
      children: () => [],
      typeArguments: () => [],
      typeParameters: () => [],
      parameters: () => [],
      members: () => [],
      elements: () => [],
      properties: () => [],
      arguments: () => [],
      is: {
        IsNewExpression: () => false,
        IsCallExpression: () => false,
        IsPropertyAccessExpression: () => false,
      },
    },
  };
}

function fakeObservationHost(facts) {
  return {
    facts,
    factResolver: {
      resolve(subject, key) {
        return facts.get(subject, key);
      },
    },
  };
}

function fakeTargetTypeHost() {
  return {
    getCsharpTargetBindingByTargetId: () => undefined,
    getCsharpObjectShapeFactForSubject: () => undefined,
    getSemanticTypeDeclarationShape: () => undefined,
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
