import { test } from "node:test";
import assert from "node:assert/strict";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { getCallableSemanticOwnership, getProviderOperationOwnership, getSemanticOwnership } from "../dist/backend/planner/semantic-guards.js";
import { KindArrowFunction, KindBindingElement, KindFunctionDeclaration, KindIdentifier, KindPropertyAccessExpression, KindVariableDeclaration } from "../dist/backend/planner/source-ast.js";

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
  const sourceFile = sourceFileNode("/src/main.ts");
  const callee = node(KindIdentifier);
  const sourceSymbol = { Name: "handler" };
  const sourceDeclaration = { Kind: KindVariableDeclaration, Initializer: node(KindArrowFunction) };
  const input = fakeInput({
    sourceFiles: [sourceFile],
    sourceReferenceByNode: new Map([[callee, { symbol: sourceSymbol, declaration: sourceDeclaration, sourceFile }]]),
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

  const ownership = getCallableSemanticOwnership(callee, sourceFile, input);

  assert.equal(ownership.requiresTargetFact, false);
  assert.equal(ownership.sourceOwned, true);
  assert.deepEqual(ownership.reasons, ["callee node runtime carrier"]);
});

test("source-owned destructured callable bindings stay source-owned from delegate carrier facts", () => {
  const sourceFile = sourceFileNode("/src/main.ts");
  const callee = node(KindIdentifier);
  const sourceSymbol = { Name: "run" };
  const sourceDeclaration = { Kind: KindBindingElement };
  const input = fakeInput({
    sourceFiles: [sourceFile],
    sourceReferenceByNode: new Map([[callee, { symbol: sourceSymbol, declaration: sourceDeclaration, sourceFile }]]),
    runtimeCarrierSubject: callee,
    runtimeCarrier: {
      carrier: delegateCarrier([{ kind: "source-primitive", name: "float64" }], { kind: "source-primitive", name: "float64" }),
    },
  });

  const ownership = getCallableSemanticOwnership(callee, sourceFile, input);

  assert.equal(ownership.requiresTargetFact, false);
  assert.equal(ownership.sourceOwned, true);
  assert.deepEqual(ownership.reasons, ["callee node runtime carrier"]);
});

test("direct lambda runtime carrier expressions are source-owned callables", () => {
  const sourceFile = sourceFileNode("/src/main.ts");
  const callee = node(KindArrowFunction);
  const input = fakeInput({
    sourceFiles: [sourceFile],
    runtimeCarrierSubject: callee,
    runtimeCarrier: {
      carrier: delegateCarrier([{ kind: "source-primitive", name: "int32" }], { kind: "source-primitive", name: "int32" }),
    },
  });

  const ownership = getCallableSemanticOwnership(callee, sourceFile, input);

  assert.equal(ownership.requiresTargetFact, false);
  assert.equal(ownership.sourceOwned, true);
  assert.deepEqual(ownership.reasons, ["callee node runtime carrier"]);
});

test("local provider aliases are not source-owned from callable runtime carrier shape", () => {
  const sourceFile = sourceFileNode("/src/main.ts");
  const callee = node(KindIdentifier);
  const sourceSymbol = { Name: "providerAlias" };
  const sourceDeclaration = { Kind: KindVariableDeclaration, Initializer: node(KindPropertyAccessExpression) };
  const input = fakeInput({
    sourceFiles: [sourceFile],
    sourceReferenceByNode: new Map([[callee, { symbol: sourceSymbol, declaration: sourceDeclaration, sourceFile }]]),
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

  const ownership = getCallableSemanticOwnership(callee, sourceFile, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["callee node runtime carrier"]);
});

test("provider virtual callable declarations are not source-owned from declaration shape", () => {
  const sourceFile = sourceFileNode("/src/main.ts");
  const providerSourceFile = sourceFileNode("/virtual/provider.ts");
  const callee = node(KindIdentifier);
  const providerDeclaration = node(KindFunctionDeclaration);
  const providerSymbol = { Name: "providerCall" };
  const input = fakeInput({
    sourceFiles: [sourceFile, providerSourceFile],
    sourceReferenceByNode: new Map([[callee, { symbol: providerSymbol, declaration: providerDeclaration, sourceFile: providerSourceFile }]]),
    providerVirtualSubjects: new Set([providerSourceFile, providerDeclaration, providerSymbol]),
  });

  const ownership = getCallableSemanticOwnership(callee, sourceFile, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, [
    "callee source file provider virtual declaration",
    "callee source declaration provider virtual declaration",
    "callee source symbol provider virtual declaration",
  ]);
});

test("declaration-file callable references are not source-owned from declaration shape", () => {
  const sourceFile = sourceFileNode("/src/main.ts");
  const declarationFile = sourceFileNode("/types/provider.d.ts", true);
  const callee = node(KindIdentifier);
  const declaration = node(KindFunctionDeclaration);
  const symbol = { Name: "declaredCall" };
  const input = fakeInput({
    sourceFiles: [sourceFile, declarationFile],
    sourceReferenceByNode: new Map([[callee, { symbol, declaration, sourceFile: declarationFile }]]),
  });

  const ownership = getCallableSemanticOwnership(callee, sourceFile, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["callee source declaration file"]);
});

test("external callable references outside project sources are not source-owned from declaration shape", () => {
  const sourceFile = sourceFileNode("/src/main.ts");
  const externalSourceFile = sourceFileNode("/external/pkg/index.ts");
  const callee = node(KindIdentifier);
  const declaration = node(KindFunctionDeclaration);
  const symbol = { Name: "externalCall" };
  const input = fakeInput({
    sourceFiles: [sourceFile],
    sourceReferenceByNode: new Map([[callee, { symbol, declaration, sourceFile: externalSourceFile }]]),
  });

  const ownership = getCallableSemanticOwnership(callee, sourceFile, input);

  assert.equal(ownership.requiresTargetFact, true);
  assert.equal(ownership.sourceOwned, false);
  assert.deepEqual(ownership.reasons, ["callee external source file"]);
});

function node(kind) {
  return { Kind: kind };
}

function sourceFileNode(fileName, isDeclarationFile = false) {
  return { IsDeclarationFile: isDeclarationFile, FileName: fileName };
}

function sourcePrimitiveCarrier(name) {
  return {
    carrier: {
      kind: "source-primitive",
      name,
    },
  };
}

function delegateCarrier(parameters, returnType) {
  return {
    kind: "target-named",
    id: `System.Func\`${parameters.length + 1}`,
    typeArguments: [...parameters, returnType],
    csharpDelegateSignature: {
      parameters,
      returnType,
    },
  };
}

function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: options.sourceFiles ?? [],
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
      getFact: (subject, key) => options.providerVirtualSubjects?.has(subject) === true && key === providerVirtualDeclarationFactKey
        ? {
            providerId: "test-provider",
            providerVersion: "1.0.0",
            providerModuleId: "test-provider/module",
            moduleSpecifier: "@provider/module",
            virtualFileName: "/virtual/provider.ts",
          }
        : undefined,
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
