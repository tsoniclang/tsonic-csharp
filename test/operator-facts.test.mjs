import { test } from "node:test";
import assert from "node:assert/strict";
import { planExpression } from "../dist/backend/planner/expressions.js";
import { KindIdentifier, KindPrefixUnaryExpression } from "../dist/backend/planner/source-ast.js";
import { printCsharpExpression } from "../dist/print/csharp-printer.js";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";

test("binary expression emission requires selected target operator fact even for source primitives", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierSubject: left,
    runtimeCarrier: sourcePrimitiveCarrier("int32"),
  }), diagnostics);

  assert.equal(output.kind, "InvalidExpression");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /C# binary operator emission requires a selected provider operator fact/);
  assert.match(diagnostics[0].message, /operand node runtime carrier/);
});

test("binary expression emission uses the finalized selected target operator fact", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.add",
      operationKind: "operator",
      targetOperation: "+",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.add",
      operator: "+",
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output.operatorToken, { kind: "PlusToken" });
  assert.equal(printCsharpExpression(output), "left + right");
});

test("assignment expression emission uses canonical assignment AST", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "tsonic.csharp.operator.assign",
      operationKind: "operator",
      targetOperation: "=",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "tsonic.csharp.operator.assign",
      operator: "=",
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "AssignmentExpression");
  assert.deepEqual(output.operatorToken, { kind: "EqualsToken" });
  assert.equal(printCsharpExpression(output), "left = right");
});

test("operator token facts must map to supported Roslyn tokens", () => {
  const left = identifier("left");
  const right = identifier("right");
  const expression = binary(left, right);
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    selectedOperatorSubject: expression,
    selectedOperator: {
      operationId: "example.raw",
      operationKind: "operator",
      targetOperation: "raw",
    },
    csharpOperationSubject: expression,
    csharpOperation: {
      kind: "operator-token",
      operationId: "example.raw",
      operator: "raw C# fragment",
    },
  }), diagnostics);

  assert.equal(output.kind, "InvalidExpression");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /unsupported finalized operator token 'raw C# fragment'/);
});

test("prefix unary expression emission requires selected target operator fact", () => {
  const operand = identifier("value");
  const expression = {
    Kind: KindPrefixUnaryExpression,
    Operand: operand,
  };
  const diagnostics = [];

  const output = planExpression(expression, {}, fakeInput({
    runtimeCarrierSubject: operand,
    runtimeCarrier: sourcePrimitiveCarrier("int32"),
  }), diagnostics);

  assert.equal(output.kind, "InvalidExpression");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /C# prefix unary operator emission requires a selected provider operator fact/);
});

function binary(left, right) {
  return {
    Kind: "KindBinaryExpression",
    Left: left,
    Right: right,
    OperatorToken: { Kind: "KindPlusToken" },
  };
}

function identifier(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

function sourcePrimitiveCarrier(name) {
  return {
    carrier: {
      kind: "source-primitive",
      name,
    },
  };
}

function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: (subject) => subject === options.selectedOperatorSubject ? options.selectedOperator : undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: (subject) => subject === options.runtimeCarrierSubject
        ? options.runtimeCarrier
        : undefined,
      getObjectShapeFact: () => undefined,
      getTargetBindingFact: () => undefined,
      getSourcePrimitiveFact: (subject) => subject === options.sourcePrimitiveSubject
        ? { kind: "int32", runtimeBase: "number", signed: true, width: 32 }
        : undefined,
      getFact: (subject, key) => subject === options.csharpOperationSubject && key === csharpTargetOperationFactKey ? options.csharpOperation : undefined,
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
    },
    semantics: {
      getTargetBindingForReference: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getRuntimeCarrierForNode: () => undefined,
      getObjectShapeForNode: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolAtLocation: () => undefined,
      getTypeAtLocation: () => options.typeAtLocation,
      getTypeFromTypeNode: () => options.typeAtLocation,
      describeTypeAtLocation: () => undefined,
    },
    types: {
      isAny: () => false,
      isUnknown: () => false,
      isNumberLike: () => false,
      isStringLike: () => false,
      isBooleanLike: () => false,
      isBigIntLike: () => false,
      isVoidLike: () => false,
      isUnion: () => false,
      isTuple: () => false,
      isArrayLike: () => false,
      isTypeReference: () => false,
      isNullish: () => false,
      getCallSignatures: () => [],
      getReturnTypeOfSignature: () => undefined,
      getUnionOrIntersectionTypes: () => [],
      getTupleElementTypes: () => [],
      getTypeArguments: () => [],
      getIndexInfos: () => [],
      getTypeReferenceTarget: (type) => type,
    },
  };
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  getSourceFile: () => undefined,
  is: {
    IsKeywordTypeNode: () => false,
    IsTypeReferenceNode: () => false,
    IsUnionTypeNode: () => false,
    IsIntersectionTypeNode: () => false,
    IsConditionalTypeNode: () => false,
    IsInferTypeNode: () => false,
    IsArrayTypeNode: () => false,
    IsIndexedAccessTypeNode: () => false,
    IsLiteralTypeNode: () => false,
    IsThisTypeNode: () => false,
    IsMappedTypeNode: () => false,
    IsTupleTypeNode: () => false,
    IsOptionalTypeNode: () => false,
    IsRestTypeNode: () => false,
    IsParenthesizedTypeNode: () => false,
    IsFunctionTypeNode: () => false,
    IsConstructorTypeNode: () => false,
    IsTemplateLiteralTypeNode: () => false,
    IsImportTypeNode: () => false,
  },
};
