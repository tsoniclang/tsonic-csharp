import { test } from "node:test";
import assert from "node:assert/strict";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { getRequiredCsharpTargetMemberOperationForSelectedSignature } from "../dist/backend/planner/csharp-target-operations.js";

test("call emission requires finalized C# target member operation facts", () => {
  const call = { Kind: 1 };
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput(),
    call,
    { member: selectedMember() },
    diagnostics,
    "C# call emission",
  );

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /generic selected target member 'Example.Box.identity``1' is not enough/);
});

test("call emission requires closed selected member in finalized C# operation fact", () => {
  const call = { Kind: 1 };
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: "Example.Box.identity``1",
        operationKind: "method",
        memberName: "Identity",
        resultType: { kind: "target-named", id: "System.String" },
      },
    }),
    call,
    { member: selectedMember() },
    diagnostics,
    "C# call emission",
  );

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a closed selected C# member/);
});

test("call emission accepts finalized C# member operation facts with substituted generic members", () => {
  const call = { Kind: 1 };
  const diagnostics = [];
  const selected = closedIdentityMember({ kind: "target-named", id: "System.String" });
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Identity",
        resultType: selected.returnType,
        selectedMember: selected,
      },
    }),
    call,
    { member: selected },
    diagnostics,
    "C# call emission",
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(operation.operationId, "Example.Box.identity``1");
  assert.deepEqual(operation.selectedMember.parameters[0].type, selected.returnType);
  assert.deepEqual(operation.resultType, selected.returnType);
});

test("call emission rejects operation facts that drop extension receiver passing", () => {
  const call = { Kind: 1 };
  const selected = extensionMember();
  const { receiverPassing: _receiverPassing, ...selectedWithoutReceiverPassing } = selected;
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Overlaps",
        static: true,
        resultType: { kind: "source-primitive", name: "bool" },
        selectedMember: selectedWithoutReceiverPassing,
      },
    }),
    call,
    { member: selected },
    diagnostics,
    "C# call emission",
  );

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /receiver-passing/);
});

test("call emission rejects operation facts that change target parameter passing", () => {
  const call = { Kind: 1 };
  const selected = extensionMember();
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Overlaps",
        static: true,
        resultType: { kind: "source-primitive", name: "bool" },
        selectedMember: {
          ...selected,
          parameters: selected.parameters.map((parameter, index) =>
            index === 2 ? { ...parameter, passingMode: "by-value" } : parameter
          ),
        },
      },
    }),
    call,
    { member: selected },
    diagnostics,
    "C# call emission",
  );

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /parameter-passing/);
});

function selectedMember() {
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

function closedIdentityMember(type) {
  return {
    id: "Example.Box.identity``1",
    sourceName: "identity",
    targetName: "Identity",
    kind: "method",
    parameters: [{
      name: "value",
      type,
      passingMode: "by-value",
    }],
    returnType: type,
    typeParameters: [{ name: "T" }],
  };
}

function extensionMember() {
  const int32 = { kind: "source-primitive", name: "int32" };
  return {
    id: "Example.MemoryExtensions.Overlaps(Example.Span`1<System.Int32>,Example.ReadOnlySpan`1<System.Int32>,System.Int32)",
    sourceName: "overlaps",
    targetName: "Overlaps",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    parameters: [
      {
        name: "span",
        type: { kind: "target-named", id: "Example.Span`1", typeArguments: [int32] },
        passingMode: "by-value",
      },
      {
        name: "other",
        type: { kind: "target-named", id: "Example.ReadOnlySpan`1", typeArguments: [int32] },
        passingMode: "by-value",
      },
      {
        name: "elementOffset",
        type: int32,
        passingMode: "byref-writeonly-must-init",
      },
    ],
    returnType: { kind: "source-primitive", name: "bool" },
    overloadGroup: "Example.MemoryExtensions.Overlaps",
  };
}

function fakeInput(options = {}) {
  return {
    facts: {
      getFact: (subject, key) =>
        subject === options.subject && key === csharpTargetOperationFactKey
          ? options.operation
          : undefined,
    },
  };
}
