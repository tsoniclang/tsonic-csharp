import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeCarrierFactKey, selectedTargetSignatureFactKey, targetOperationFactKey } from "@tsonic/tsts";
import { csharpSelectedCallTargetFactKey, csharpSelectedPropertyTargetFactKey, csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { recordCsharpSelectedCallOperationFactsBeforeFinalization, recordCsharpSelectedPropertyOperationFactsBeforeFinalization } from "../dist/source/csharp-source-semantics/csharp-operation-lifecycle.js";

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

test("selected call lifecycle requires a finalized first-argument receiver carrier", () => {
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

test("selected call lifecycle records first-argument receiver operations from exact selected signature and carrier facts", () => {
  const receiver = { Kind: "identifier" };
  const callee = { Kind: "property", Expression: receiver };
  const call = { Kind: "call", Expression: callee };
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [call] } };
  const member = firstArgumentReceiverMember();
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, { carrier: member.parameters[0].type });
  facts.set(call, selectedTargetSignatureFactKey, { member });
  facts.set(call, csharpSelectedCallTargetFactKey, { member });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedCallOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost());

  const operation = facts.get(call, csharpTargetOperationFactKey);
  assert.equal(operation.kind, "member");
  assert.equal(operation.operationId, member.id);
  assert.equal(operation.selectedMember.receiverPassing, "first-argument");
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

test("selected call lifecycle preserves real double provider members against receiver carrier mismatch", () => {
  const receiver = { Kind: "identifier" };
  const callee = { Kind: "property", Expression: receiver };
  const call = { Kind: "call", Expression: callee };
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [call] } };
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, { carrier: spanType(csharpInt32TargetType()) });
  facts.set(call, selectedTargetSignatureFactKey, {
    member: copyToMember(spanType(csharpFloat64TargetType())),
  });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedCallOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost([spanBinding()]));

  const operation = facts.get(call, csharpTargetOperationFactKey);
  assert.equal(operation.kind, "member");
  assert.equal(operation.operationId, "Example.Span`1.CopyTo(Example.Span`1<T>)");
  assert.deepEqual(operation.selectedMember.declaringType, spanType(csharpFloat64TargetType()));
  assert.deepEqual(operation.selectedMember.parameters[0].type, spanType(csharpFloat64TargetType()));
});

test("selected property lifecycle closes JS property operations from exact selected identity and receiver carrier facts", () => {
  const receiver = { Kind: "identifier" };
  const property = { Kind: "property", Expression: receiver };
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [property] } };
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, {
    carrier: { kind: "array", element: csharpInt32TargetType() },
  });
  facts.set(property, targetOperationFactKey, {
    operationId: "tsonic.csharp.js.Array.length",
    operationKind: "property",
    targetOperation: "length",
  });
  facts.set(property, csharpSelectedPropertyTargetFactKey, {
    operationId: "tsonic.csharp.js.Array.length",
  });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedPropertyOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost());

  const operation = facts.get(property, csharpTargetOperationFactKey);
  assert.equal(operation.kind, "member");
  assert.equal(operation.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(operation.memberName, "Length");
});

test("selected property lifecycle does not infer JS property operations without selected identity facts", () => {
  const receiver = { Kind: "identifier" };
  const property = { Kind: "property", Expression: receiver };
  const sourceFile = { IsDeclarationFile: false, Statements: { Nodes: [property] } };
  const facts = new TestFactStore();
  facts.set(receiver, runtimeCarrierFactKey, {
    carrier: { kind: "array", element: csharpInt32TargetType() },
  });
  facts.set(property, targetOperationFactKey, {
    operationId: "tsonic.csharp.js.Array.length",
    operationKind: "property",
    targetOperation: "length",
  });

  const host = fakeObservationHost(facts);
  recordCsharpSelectedPropertyOperationFactsBeforeFinalization({
    host,
    compiler: fakeCompiler([sourceFile]),
  }, fakeTargetTypeHost());

  assert.equal(facts.get(property, csharpTargetOperationFactKey), undefined);
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

function copyToMember(span) {
  return {
    id: "Example.Span`1.CopyTo(Example.Span`1<T>)",
    sourceName: "CopyTo",
    targetName: "CopyTo",
    kind: "method",
    declaringType: span,
    parameters: [{
      name: "destination",
      type: span,
      passingMode: "by-value",
    }],
    returnType: { kind: "source-primitive", name: "void" },
  };
}

function spanBinding() {
  const typeParameter = { kind: "type-parameter", name: "T" };
  return {
    id: "Example.Span`1",
    target: "csharp",
    kind: "struct",
    sourceName: "Span",
    targetName: "Example.Span",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Span" },
    typeParameters: [{ name: "T" }],
    members: [copyToMember(spanType(typeParameter))],
  };
}

function spanType(element) {
  return {
    kind: "target-named",
    id: "Example.Span`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["Example"], name: "Span" },
  };
}

function csharpInt32TargetType() {
  return { kind: "source-primitive", name: "int32" };
}

function csharpFloat64TargetType() {
  return { kind: "source-primitive", name: "float64" };
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
    csharpRender: { kind: "named", namespace: ["Example"], name: "Span" },
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
      children: (node) => node?.Statements?.Nodes ??
        (node?.Expression === undefined ? [] : [node.Expression]),
      typeArguments: () => [],
      typeParameters: () => [],
      parameters: () => [],
      members: () => [],
      elements: () => [],
      properties: () => [],
      arguments: () => [],
      is: {
        IsNewExpression: () => false,
        IsCallExpression: (node) => node?.Kind === "call",
        IsPropertyAccessExpression: (node) => node?.Kind === "property",
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

function fakeTargetTypeHost(bindings = []) {
  const byId = new Map(bindings.map((binding) => [binding.id, binding]));
  return {
    getCsharpTargetBindingByTargetId: (id) => byId.get(id),
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
