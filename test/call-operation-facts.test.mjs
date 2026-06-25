import { test } from "node:test";
import assert from "node:assert/strict";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { getRequiredCsharpTargetMemberOperationForSelectedSignature } from "../dist/backend/planner/csharp-target-operations.js";
import { planCallArgumentCore } from "../dist/backend/planner/expression-call-arguments.js";
import {
  planSelectedTargetCallee,
  planSelectedTargetReceiverExpression,
} from "../dist/backend/planner/expression-selected-target-members.js";
import {
  KindIdentifier,
} from "../dist/backend/planner/source-ast.js";

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

test("call emission rejects operation facts with mismatched target operation kind", () => {
  const call = { Kind: 1 };
  const selected = closedIdentityMember({ kind: "target-named", id: "System.String" });
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "indexer",
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

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /target operation kind/);
});

test("call argument emission applies explicit target conversion facts before selected expected types", () => {
  const argument = identifier("value");
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeArgumentInput({
      conversionSubject: argument,
      conversion: {
        convertedType: { kind: "source-primitive", name: "int64" },
      },
    }),
    diagnostics,
    identifierExpressionPlanner,
    expectedIdentifierExpressionPlanner,
    { kind: "PredefinedType", name: "long" },
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "Argument",
    expression: { kind: "IdentifierName", name: "value_as_long" },
  });
});

test("call argument emission separates semantic conversion type from render expected type", () => {
  const argument = identifier("value");
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeArgumentInput({
      conversionSubject: argument,
      conversion: {
        convertedType: { kind: "source-primitive", name: "int32" },
      },
    }),
    diagnostics,
    identifierExpressionPlanner,
    expectedIdentifierExpressionPlanner,
    { kind: "PredefinedType", name: "long" },
    undefined,
    { kind: "PredefinedType", name: "int" },
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "Argument",
    expression: { kind: "IdentifierName", name: "value_as_long" },
  });
});

test("call argument emission rejects conversion facts that mismatch selected expected types", () => {
  const argument = identifier("value");
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeArgumentInput({
      conversionSubject: argument,
      conversion: {
        convertedType: { kind: "source-primitive", name: "int64" },
      },
    }),
    diagnostics,
    identifierExpressionPlanner,
    expectedIdentifierExpressionPlanner,
    { kind: "PredefinedType", name: "int" },
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /conversion fact does not match/);
});

test("call argument emission rejects unsupported finalized argument-passing modes", () => {
  const argument = identifier("borrow");
  const targetExpression = identifier("value");
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeArgumentInput({
      argumentPassingSubject: argument,
      argumentPassing: {
        mode: "borrow-shared",
        targetExpression,
      },
    }),
    diagnostics,
    identifierExpressionPlanner,
    expectedIdentifierExpressionPlanner,
  );

  assert.equal(planned.passing, undefined);
  assert.deepEqual(planned.expression, { kind: "IdentifierName", name: "value" });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /does not support finalized argument-passing mode 'borrow-shared'/);
});

test("selected target receiver expression uses planned binding identity instead of source text", () => {
  const receiver = identifier("array");
  const diagnostics = [];
  const expression = planSelectedTargetReceiverExpression(
    receiver,
    sourceFile,
    fakeSelectedInput(),
    diagnostics,
    () => ({ kind: "IdentifierName", name: "array_1" }),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(expression, { kind: "IdentifierName", name: "array_1" });
});

test("selected target identifier calls reject instance members without a value receiver", () => {
  const callee = identifier("parse");
  const diagnostics = [];
  const expression = planSelectedTargetCallee(
    callee,
    {
      kind: "member",
      operationId: "Example.Parser.Parse",
      operationKind: "method",
      memberName: "Parse",
      static: false,
    },
    sourceFile,
    fakeSelectedInput(),
    diagnostics,
    () => {
      throw new Error("bare instance target call must not ask expression planner for a callee");
    },
  );

  assert.equal(expression, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a value receiver/);
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

function fakeArgumentInput(options = {}) {
  return {
    facts: {
      getArgumentPassingFact: (subject) =>
        subject === options.argumentPassingSubject ? options.argumentPassing : undefined,
      getTargetConversionFact: (subject) =>
        subject === options.conversionSubject ? options.conversion : undefined,
    },
  };
}

function fakeSelectedInput() {
  return {
    ast: {
      kindName: (node) => String(node?.Kind),
    },
    semantics: {
      getProjectSourceReferenceForNode: () => undefined,
      getTargetBindingForReference: () => undefined,
    },
  };
}

function identifier(text) {
  return { Kind: KindIdentifier, Text: text };
}

function identifierExpressionPlanner(node) {
  return { kind: "IdentifierName", name: node.Text };
}

function expectedIdentifierExpressionPlanner(node, _sourceFile, _input, _diagnostics, expectedType) {
  return {
    kind: "IdentifierName",
    name: `${node.Text}_as_${expectedType.name}`,
  };
}

const sourceFile = {
  FileName: "/src/index.ts",
  IsDeclarationFile: false,
};
