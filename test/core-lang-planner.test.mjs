import assert from "node:assert/strict";
import { test } from "node:test";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
} from "./helpers/target-facts.mjs";
import { getCsharpTypeForNode } from "../dist/backend/planner/csharp-types.js";
import { planCallArgumentCore } from "../dist/backend/planner/expression-call-arguments.js";
import { planExpression } from "../dist/backend/planner/expressions.js";
import { printCsharpType } from "../dist/print/csharp-printer.js";
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
    nullForgiving: true,
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
  const storageExpression = identifier("value");
  const diagnostics = [];

  const planned = planCallArgumentCore(
    markerCall,
    sourceFile,
    fakeInput(sourceFile, {
      argumentPassing: new Map([[markerCall, {
        mode: "byref-writeonly-must-init",
        storageExpression,
      }]]),
    }),
    diagnostics,
    identifierExpressionPlanner,
    identifierExpressionPlanner,
    undefined,
    undefined,
    undefined,
    "byref-writeonly-must-init",
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "Argument",
    expression: { kind: "IdentifierName", name: "value" },
    passing: "out",
  });
});

test("planner rejects byref markers when selected parameter mode is by-value", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const markerCall = node(KindCallExpression);
  const storageExpression = identifier("value");
  const diagnostics = [];

  const planned = planCallArgumentCore(
    markerCall,
    sourceFile,
    fakeInput(sourceFile, {
      argumentPassing: new Map([[markerCall, {
        mode: "byref-readwrite",
        storageExpression,
      }]]),
    }),
    diagnostics,
    identifierExpressionPlanner,
    identifierExpressionPlanner,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /does not match the selected call parameter mode 'by-value'/);
});

test("planner rejects byref selected parameters without matching marker facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const argument = identifier("value");
  const diagnostics = [];

  const planned = planCallArgumentCore(
    argument,
    sourceFile,
    fakeInput(sourceFile),
    diagnostics,
    identifierExpressionPlanner,
    identifierExpressionPlanner,
    undefined,
    undefined,
    undefined,
    "byref-readonly",
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires finalized argument-passing facts/);
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
        storageExpression: { kind: "target-specific", target: "csharp", name: "value" },
      }]]),
    }),
    diagnostics,
    () => undefined,
    () => undefined,
    undefined,
    undefined,
    undefined,
    "byref-readwrite",
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Argument-passing facts must carry AST target expressions/);
});

test("planner emits ptr and fnptr only from finalized nested type facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const intType = typeReference("int32");
  const boolType = typeReference("bool");
  const pointerType = typeReference("ptr", [intType]);
  const functionPointerType = typeReference("fnptr", [intType, boolType]);
  const diagnostics = [];
  const input = fakeInput(sourceFile, {
    sourcePrimitives: new Map([
      [intType, primitive("int32")],
      [boolType, primitive("bool")],
    ]),
    pointerFacts: new Map([[pointerType, {
      pointee: intType,
      mutability: "unspecified",
      unsafeRequired: true,
    }]]),
    functionPointerFacts: new Map([[functionPointerType, {
      parameters: [intType],
      result: boolType,
      abi: ["target-default"],
    }]]),
  });

  assert.equal(printCsharpType(getCsharpTypeForNode(pointerType, sourceFile, input, undefined, diagnostics)), "int*");
  assert.equal(printCsharpType(getCsharpTypeForNode(functionPointerType, sourceFile, input, undefined, diagnostics)), "delegate*<int, bool>");
  assert.deepEqual(diagnostics, []);

  const missingDiagnostics = [];
  const missingPointer = getCsharpTypeForNode(pointerType, sourceFile, fakeInput(sourceFile, {
    pointerFacts: new Map([[pointerType, {
      pointee: intType,
      mutability: "unspecified",
      unsafeRequired: true,
    }]]),
  }), undefined, missingDiagnostics);
  const missingFunctionPointer = getCsharpTypeForNode(functionPointerType, sourceFile, fakeInput(sourceFile, {
    functionPointerFacts: new Map([[functionPointerType, {
      parameters: [intType],
      result: boolType,
      abi: ["target-default"],
    }]]),
  }), undefined, missingDiagnostics);

  assert.equal(missingPointer.kind, "InvalidType");
  assert.equal(missingFunctionPointer.kind, "InvalidType");
  assert.equal(missingDiagnostics.length, 2);
  assert.match(missingDiagnostics[0].message, /Pointer type marker requires a finalized pointee target type/);
  assert.match(missingDiagnostics[1].message, /Function pointer type marker requires finalized parameter and result target types/);
  assert.ok(missingDiagnostics[0].evidence?.some((entry) => entry.includes("pointeeSubject=")));
  assert.ok(missingDiagnostics[1].evidence?.some((entry) => entry.includes("resultSubject=")));
});

function node(kind, properties = {}) {
  return { Kind: kind, ...properties };
}

function identifier(text) {
  return node(KindIdentifier, { Text: text });
}

function typeReference(name, typeArguments = []) {
  return node(KindTypeReference, {
    Text: name,
    TypeName: identifier(name),
    TypeArguments: { Nodes: typeArguments },
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
      forEachChild: (candidate, visit) => {
        for (const child of [
          candidate?.TypeName,
          ...(candidate?.TypeArguments?.Nodes ?? []),
        ]) {
          if (child !== undefined) {
            visit(child);
          }
        }
      },
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
      getPointerFact: (subject) => options.pointerFacts?.get(subject),
      getFunctionPointerFact: (subject) => options.functionPointerFacts?.get(subject),
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
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getProjectSourceDeclarationForNode: () => undefined,
      getTypeFromTypeNode: () => undefined,
      getTypeAtLocation: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getProjectSourceReferenceForSymbol: () => undefined,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: () => missingCarrierResolution(),
      resolveRuntimeCarrierForNode: () => missingCarrierResolution(),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
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
