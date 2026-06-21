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
