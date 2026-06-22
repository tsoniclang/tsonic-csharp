import { test } from "node:test";
import assert from "node:assert/strict";
import { getCallableSemanticOwnership, getProviderOperationOwnership, getSemanticOwnership } from "../dist/backend/planner/semantic-guards.js";
import { KindIdentifier, KindPropertyAccessExpression, KindVariableDeclaration } from "../dist/backend/planner/source-ast.js";

test("provider-owned operator operands require selected target operator facts", () => {
  const operand = node(KindIdentifier);
  const targetType = { flags: 0 };
  const input = fakeInput({
    typeAtLocation: targetType,
    targetBindingSubject: targetType,
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.deepEqual(ownership.reasons, ["operand semantic node target binding"]);
});

test("source primitive operator operands require selected target operator facts", () => {
  const operand = node(KindIdentifier);
  const input = fakeInput({
    runtimeCarrierSubject: operand,
    runtimeCarrier: sourcePrimitiveCarrier("int32"),
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["operand node runtime carrier"]);
});

test("source primitive facts on shared semantic Type identity are ignored", () => {
  const operand = node(KindIdentifier);
  const primitiveType = {};
  const input = fakeInput({
    typeAtLocation: primitiveType,
    sourcePrimitiveSubject: primitiveType,
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, false);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, []);
});

test("unowned non-scalar operator operands are not direct source operations", () => {
  const operand = node(KindIdentifier);
  const input = fakeInput({
    typeAtLocation: { flags: 0 },
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, false);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, []);
});

test("primitive member access still requires selected target member facts", () => {
  const receiver = node(KindIdentifier);
  const input = fakeInput({
    runtimeCarrierSubject: receiver,
    runtimeCarrier: sourcePrimitiveCarrier("int32"),
  });

  const ownership = getSemanticOwnership(receiver, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["node runtime carrier"]);
});

test("type parameter operands are classified from finalized runtime carrier facts", () => {
  const operand = node(KindIdentifier);
  const typeParameter = {};
  const input = fakeInput({
    typeAtLocation: typeParameter,
    runtimeCarrierSubject: typeParameter,
    runtimeCarrier: { carrier: { kind: "type-parameter", name: "T" } },
  });

  const ownership = getProviderOperationOwnership(operand, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["operand semantic node runtime carrier"]);
});

test("provider-owned constructor callees require selected target constructor facts", () => {
  const targetSymbol = { Name: "ProviderBox" };
  const callee = { Kind: KindIdentifier, Text: "ProviderBox" };
  const input = fakeInput({
    symbolAtLocation: targetSymbol,
    targetBindingSubject: targetSymbol,
  });

  const ownership = getCallableSemanticOwnership(callee, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.deepEqual(ownership.reasons, ["callee symbol target binding"]);
});

test("provider-owned property-access callees require selected target call facts", () => {
  const receiver = node(KindIdentifier);
  const targetSymbol = { Name: "ProviderBox" };
  const callee = { Kind: KindPropertyAccessExpression, Expression: receiver };
  const input = fakeInput({
    symbolsByNode: new Map([[receiver, targetSymbol]]),
    targetBindingSubject: targetSymbol,
    projectSourceShape: true,
  });

  const ownership = getCallableSemanticOwnership(callee, {}, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["callee receiver symbol target binding"]);
});

test("source-declared callable references stay source-owned with runtime-carrier facts", () => {
  const callee = node(KindIdentifier);
  const sourceSymbol = { Name: "handler" };
  const sourceDeclaration = node(KindVariableDeclaration);
  const input = fakeInput({
    sourceReferenceByNode: new Map([[callee, { symbol: sourceSymbol, declaration: sourceDeclaration }]]),
    runtimeCarrierSubject: callee,
    runtimeCarrier: {
      carrier: {
        kind: "target-named",
        id: "System.Func`2",
        typeArguments: [
          { kind: "source-primitive", name: "int32" },
          { kind: "source-primitive", name: "int32" },
        ],
      },
    },
  });

  const ownership = getCallableSemanticOwnership(callee, {}, input);

  assert.equal(ownership.requiresTargetFact, false);
  assert.equal(ownership.sourceOwned, true);
  assert.deepEqual(ownership.reasons, ["callee node runtime carrier"]);
});

function node(kind) {
  return { Kind: kind };
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
    types: {
      isAny: () => false,
      isUnknown: () => false,
      isNumberLike: (type) => type === options.numberLikeType,
      isStringLike: (type) => type === options.stringLikeType,
      isBooleanLike: (type) => type === options.booleanLikeType,
      isBigIntLike: (type) => type === options.bigIntLikeType,
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
    facts: {
      getSelectedTargetCall: () => options.selectedTargetCall,
      getSelectedTargetOperator: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getTargetBindingFact: (subject) => subject !== undefined && subject === options.targetBindingSubject
        ? { target: "csharp", id: "Example.TargetType" }
        : undefined,
      getFact: () => undefined,
      getRuntimeCarrierFact: (subject) => subject !== undefined && subject === options.runtimeCarrierSubject
        ? options.runtimeCarrier
        : undefined,
      getSourcePrimitiveFact: (subject) => subject !== undefined && subject === options.sourcePrimitiveSubject
        ? { kind: "int32", runtimeBase: "number", signed: true, width: 32 }
        : undefined,
      getTargetConversionFact: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getDefaultValueFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
    },
    semantics: {
      getSymbolAtLocation: (node) => options.symbolsByNode?.get(node) ?? options.symbolAtLocation,
      getTypeAtLocation: () => options.typeAtLocation,
      getResolvedSymbol: () => undefined,
      getRuntimeCarrierForNode: () => {
        return undefined;
      },
      getObjectShapeForNode: () => undefined,
      getTargetBindingForReference: () => options.targetBindingSubject !== undefined && options.targetBindingSubject === options.typeAtLocation
        ? { target: "csharp", id: "Example.TargetType" }
        : undefined,
      isProjectSourceShapeForNode: () => options.projectSourceShape === true,
      isProjectSourceConstructibleObjectForNode: () => options.projectSourceConstructibleObject === true,
      getProjectSourceDeclarationForNode: () => undefined,
      getProjectSourceReferenceForNode: (node) => options.sourceReferenceByNode?.get(node),
      getEnumMemberConstant: () => undefined,
      getReturnTypeCarrierFromDeclaration: () => undefined,
      describeTypeAtLocation: () => undefined,
    },
  };
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
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
