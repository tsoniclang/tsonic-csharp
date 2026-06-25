import assert from "node:assert/strict";
import { test } from "node:test";
import { planCallArgumentCore } from "../dist/backend/planner/expression-call-arguments.js";
import { planExpression } from "../dist/backend/planner/expressions.js";
import {
  KindCallExpression,
  KindIdentifier,
  KindTypeReference,
} from "../dist/backend/planner/source-ast.js";

test("planner emits default expressions only from finalized defaultof facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const defaultCall = node(KindCallExpression);
  const intType = typeReference("int32");
  const diagnostics = [];

  const planned = planExpression(defaultCall, sourceFile, fakeInput(sourceFile, {
    defaultValues: new Map([[defaultCall, { type: intType }]]),
    sourcePrimitives: new Map([[intType, primitive("int32")]]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "DefaultExpression",
    type: { kind: "PredefinedType", name: "int" },
  });
});

test("planner rejects defaultof facts without AST type evidence", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const defaultCall = node(KindCallExpression);
  const diagnostics = [];

  const planned = planExpression(defaultCall, sourceFile, fakeInput(sourceFile, {
    defaultValues: new Map([[defaultCall, { type: { flags: 1 } }]]),
  }), diagnostics);

  assert.equal(planned.kind, "DefaultExpression");
  assert.equal(planned.type.kind, "InvalidType");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Source fact type subject must be an AST type node/);
});

test("planner emits byref arguments only from finalized argument-passing facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const markerCall = node(KindCallExpression);
  const targetExpression = identifier("value");
  const diagnostics = [];

  const planned = planCallArgumentCore(
    markerCall,
    sourceFile,
    fakeInput(sourceFile, {
      argumentPassing: new Map([[markerCall, {
        mode: "byref-writeonly-must-init",
        targetExpression,
      }]]),
    }),
    diagnostics,
    identifierExpressionPlanner,
    identifierExpressionPlanner,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "Argument",
    expression: { kind: "IdentifierName", name: "value" },
    passing: "out",
  });
});

test("planner rejects argument-passing facts without AST target expressions", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const markerCall = node(KindCallExpression);
  const diagnostics = [];

  const planned = planCallArgumentCore(
    markerCall,
    sourceFile,
    fakeInput(sourceFile, {
      argumentPassing: new Map([[markerCall, {
        mode: "byref-readwrite",
        targetExpression: { kind: "target-specific", target: "csharp", name: "value" },
      }]]),
    }),
    diagnostics,
    () => ({ kind: "InvalidExpression", reason: "fallback marker call" }),
    () => ({ kind: "InvalidExpression", reason: "fallback marker call" }),
  );

  assert.equal(planned.passing, undefined);
  assert.equal(planned.expression.kind, "InvalidExpression");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Argument-passing facts must carry AST target expressions/);
});

function node(kind, properties = {}) {
  return { Kind: kind, ...properties };
}

function identifier(text) {
  return node(KindIdentifier, { Text: text });
}

function typeReference(name) {
  return node(KindTypeReference, {
    Text: name,
    TypeName: identifier(name),
    TypeArguments: { Nodes: [] },
  });
}

function sourceFileNode(fileName) {
  return node("KindSourceFile", {
    FileName: fileName,
    IsDeclarationFile: false,
    Statements: { Nodes: [] },
  });
}

function primitive(kind) {
  return {
    kind,
    runtimeBase: "number",
    signed: true,
    width: 32,
  };
}

function identifierExpressionPlanner(expression) {
  return {
    kind: "IdentifierName",
    name: expression.Text,
  };
}

function fakeInput(sourceFile, options = {}) {
  return {
    ast: {
      kindName: (candidate) => String(candidate?.Kind ?? "Undefined"),
      kindNameFromKind: (kind) => String(kind),
      text: (candidate) => String(candidate?.Text ?? ""),
      name: (candidate) => candidate?.name ?? candidate?.TypeName,
      typeArguments: (candidate) => candidate?.TypeArguments?.Nodes ?? [],
      parent: () => undefined,
      getSourceFile: () => sourceFile,
      is: {
        IsKeywordTypeNode: () => false,
        IsTypeReferenceNode: (candidate) => candidate?.Kind === KindTypeReference,
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
    },
    sourceFiles: [sourceFile],
    facts: {
      getDefaultValueFact: (subject) => options.defaultValues?.get(subject),
      getArgumentPassingFact: (subject) => options.argumentPassing?.get(subject),
      getTargetConversionFact: () => undefined,
      getSelectedTargetCall: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: () => undefined,
      getObjectShapeFact: () => undefined,
      getTargetBindingFact: () => undefined,
      getFact: () => undefined,
      getSourcePrimitiveFact: (subject) => options.sourcePrimitives?.get(subject),
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
    },
    semantics: {
      getProjectSourceReferenceForNode: () => undefined,
      getTargetBindingForReference: () => undefined,
      getProjectSourceDeclarationForNode: () => undefined,
      getTypeFromTypeNode: () => undefined,
      getTypeAtLocation: () => undefined,
      getRuntimeCarrierForNode: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getProjectSourceReferenceForSymbol: () => undefined,
      getResolvedCallReturnRuntimeCarrier: () => undefined,
      getResolvedCallReturnType: () => undefined,
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
