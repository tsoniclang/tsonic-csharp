import { test, assert, csharpTargetOperationFactKey, csharpEnumerableTargetType, getRequiredCsharpTargetMemberOperationForSelectedSignature, planCallArgumentCore, planSelectedTargetCallee, planSelectedTargetReceiverExpression, KindIdentifier, targetMemberAsSourceSelectedSignature, selectedMember, closedIdentityMember, csharpStringType, extensionMember, callableInvokeMember, callableByrefInvokeMember, fakeInput, fakeArgumentInput, fakeSelectedInput, identifier, identifierExpressionPlanner, expectedIdentifierExpressionPlanner, expectedTypeKindExpressionPlanner, sourceFile, sourceFileWithText, sourceLocatedIdentifier } from "./call-operation-facts.helpers.mjs";

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
test("call emission rejects operation facts that drift selected return types", () => {
  const call = { Kind: 1 };
  const selected = closedIdentityMember(csharpStringType());
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Identity",
        resultType: { kind: "source-primitive", name: "int32" },
        selectedMember: {
          ...selected,
          returnType: { kind: "source-primitive", name: "int32" },
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
  assert.match(diagnostics[0].message, /return-type/);
});
test("call emission rejects operation facts that drift selected declaring types", () => {
  const call = { Kind: 1 };
  const selected = {
    ...closedIdentityMember(csharpStringType()),
    declaringType: { kind: "target-named", id: "Example.Box" },
  };
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Identity",
        resultType: selected.returnType,
        selectedMember: {
          ...selected,
          declaringType: { kind: "target-named", id: "Example.OtherBox" },
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
  assert.match(diagnostics[0].message, /declaring-type/);
});
test("call emission rejects operation facts that drift selected parameter types", () => {
  const call = { Kind: 1 };
  const selected = closedIdentityMember(csharpStringType());
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Identity",
        resultType: selected.returnType,
        selectedMember: {
          ...selected,
          parameters: [{
            ...selected.parameters[0],
            type: { kind: "source-primitive", name: "int32" },
          }],
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
  assert.match(diagnostics[0].message, /parameter-type/);
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
  const selectedTargetMember = extensionMember();
  const sourceSelectedMember = targetMemberAsSourceSelectedSignature({
    ...selectedTargetMember,
    declaringType: selectedTargetMember.parameters[0].type,
  });
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selectedTargetMember.id,
        operationKind: "method",
        memberName: "Overlaps",
        static: true,
        resultType: { kind: "source-primitive", name: "bool" },
        selectedMember: {
          ...selectedTargetMember,
          declaringType: selectedTargetMember.parameters[0].type,
          parameters: selectedTargetMember.parameters.map((parameter, index) =>
            index === 2 ? { ...parameter, passingMode: "by-value" } : parameter
          ),
        },
      },
    }),
    call,
    { member: sourceSelectedMember },
    diagnostics,
    "C# call emission",
  );

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /parameter-passing/);
});
test("call emission accepts finalized callable Invoke facts with default and params parameters", () => {
  const call = { Kind: 1 };
  const selected = callableInvokeMember();
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Invoke",
        resultType: selected.returnType,
        selectedMember: selected,
      },
    }),
    call,
    { member: selected },
    diagnostics,
    "C# callable emission",
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(operation?.selectedMember?.parameters[1]?.defaultValue.value, "proved");
  assert.equal(operation?.selectedMember?.parameters[2]?.paramsArray, true);
});
test("call emission accepts finalized callable Invoke facts with byref parameter modes", () => {
  const call = { Kind: 1 };
  const selected = callableByrefInvokeMember();
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Invoke",
        resultType: selected.returnType,
        selectedMember: selected,
      },
    }),
    call,
    { member: selected },
    diagnostics,
    "C# callable emission",
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(operation?.selectedMember?.parameters[0]?.passingMode, "byref-readwrite");
  assert.equal(operation?.selectedMember?.parameters[1]?.passingMode, "byref-writeonly-must-init");
  assert.equal(operation?.selectedMember?.parameters[2]?.passingMode, "byref-readonly");
});
test("call emission rejects operation facts that drift selected parameter default facts", () => {
  const call = { Kind: 1 };
  const selected = callableInvokeMember();
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Invoke",
        resultType: selected.returnType,
        selectedMember: {
          ...selected,
          parameters: selected.parameters.map((parameter, index) =>
            index === 1
              ? { ...parameter, defaultValue: { kind: "string", value: "mutated" } }
              : parameter
          ),
        },
      },
    }),
    call,
    { member: selected },
    diagnostics,
    "C# callable emission",
  );

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /parameter-default/);
});
test("call emission rejects callable Invoke facts that drift byref parameter modes", () => {
  const call = { Kind: 1 };
  const selected = callableByrefInvokeMember();
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selected.id,
        operationKind: "method",
        memberName: "Invoke",
        resultType: selected.returnType,
        selectedMember: {
          ...selected,
          parameters: selected.parameters.map((parameter, index) =>
            index === 1 ? { ...parameter, passingMode: "by-value" } : parameter
          ),
        },
      },
    }),
    call,
    { member: selected },
    diagnostics,
    "C# callable emission",
  );

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /parameter-passing/);
});
test("call emission rejects operation facts that hide mismatched first-argument receiver types", () => {
  const call = { Kind: 1 };
  const selectedTargetMember = extensionMember();
  const sourceSelectedMember = targetMemberAsSourceSelectedSignature({
    ...selectedTargetMember,
    declaringType: selectedTargetMember.parameters[0].type,
  });
  const diagnostics = [];
  const operation = getRequiredCsharpTargetMemberOperationForSelectedSignature(
    fakeInput({
      subject: call,
      operation: {
        kind: "member",
        operationId: selectedTargetMember.id,
        operationKind: "method",
        memberName: "Overlaps",
        static: true,
        resultType: { kind: "source-primitive", name: "bool" },
        selectedMember: {
          ...selectedTargetMember,
          declaringType: selectedTargetMember.parameters[0].type,
          parameters: [
            {
              ...selectedTargetMember.parameters[0],
              type: { kind: "target-named", id: "Example.OtherSpan`1", typeArguments: [{ kind: "source-primitive", name: "int32" }] },
            },
            ...selectedTargetMember.parameters.slice(1),
          ],
        },
      },
    }),
    call,
    { member: sourceSelectedMember },
    diagnostics,
    "C# call emission",
  );

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /mismatched selected member/);
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
  const int32 = { kind: "source-primitive", name: "int32" };
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeArgumentInput({
      conversionSubject: argument,
      conversion: {
        convertedType: int32,
      },
    }),
    diagnostics,
    identifierExpressionPlanner,
    expectedIdentifierExpressionPlanner,
    { kind: "PredefinedType", name: "long" },
    undefined,
    int32,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "Argument",
    expression: { kind: "IdentifierName", name: "value_as_long" },
  });
});
test("call argument emission rejects conversion facts that mismatch selected expected types", () => {
  const argument = identifier("value");
  const int32 = { kind: "source-primitive", name: "int32" };
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
    undefined,
    int32,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /conversion fact does not match/);
});
test("call argument emission rejects primitive-name mismatches for real double parameters", () => {
  const argument = identifier("values");
  const int32 = { kind: "source-primitive", name: "int32" };
  const float64 = { kind: "source-primitive", name: "float64" };
  const int32Array = { kind: "array", element: int32 };
  const float64Array = { kind: "array", element: float64 };
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeArgumentInput({
      conversionSubject: argument,
      conversion: {
        convertedType: int32Array,
      },
    }),
    diagnostics,
    identifierExpressionPlanner,
    expectedTypeKindExpressionPlanner,
    { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } },
    undefined,
    float64Array,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /conversion fact does not match/);
});
test("call argument emission accepts exact real double conversion facts", () => {
  const argument = identifier("values");
  const float64 = { kind: "source-primitive", name: "float64" };
  const float64Array = { kind: "array", element: float64 };
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeArgumentInput({
      conversionSubject: argument,
      conversion: {
        convertedType: float64Array,
      },
    }),
    diagnostics,
    identifierExpressionPlanner,
    expectedTypeKindExpressionPlanner,
    { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "double" } },
    undefined,
    float64Array,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "Argument",
    expression: { kind: "IdentifierName", name: "values_as_ArrayType" },
  });
});
test("call argument emission permits array render carriers for selected collection parameters", () => {
  const argument = identifier("items");
  const int32 = { kind: "source-primitive", name: "int32" };
  const enumerableInt32 = csharpEnumerableTargetType(int32);
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeArgumentInput({
      conversionSubject: argument,
      conversion: {
        convertedType: enumerableInt32,
      },
    }),
    diagnostics,
    identifierExpressionPlanner,
    expectedTypeKindExpressionPlanner,
    { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } },
    undefined,
    enumerableInt32,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "Argument",
    expression: { kind: "IdentifierName", name: "items_as_ArrayType" },
  });
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

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /does not support finalized argument-passing mode 'borrow-shared'/);
});
test("call argument emission reports source evidence when selected byref facts are missing", () => {
  const argument = sourceLocatedIdentifier("value");
  const diagnostics = [];
  const planned = planCallArgumentCore(
    argument,
    sourceFileWithText,
    fakeArgumentInput(),
    diagnostics,
    identifierExpressionPlanner,
    expectedIdentifierExpressionPlanner,
    undefined,
    undefined,
    undefined,
    "byref-writeonly-must-init",
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires finalized argument-passing facts/);
  assert.ok(diagnostics[0].evidence?.includes("source.module=/src/index.ts"));
  assert.ok(diagnostics[0].evidence?.includes("source.file=/src/index.ts"));
  assert.ok(diagnostics[0].evidence?.some((entry) => entry.startsWith("source.span=2:10-2:15")));
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