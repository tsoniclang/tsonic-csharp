import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deferObservation,
} from "@tsonic/tsts";
import {
  createCsharpNativeOperationsProvider,
} from "../dist/source/csharp-source-semantics/operations-provider.js";
import {
  isCsharpSourceOwnedSelectedSignature,
} from "../dist/source/csharp-source-semantics/source-owned-selected-signature.js";

test("source-owned checked calls close over destructured binding carrier facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const bindingElement = node("KindBindingElement", sourceFile);
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "run" };
  const float64 = { kind: "source-primitive", name: "float64" };
  const delegateCarrier = {
    kind: "target-named",
    id: "System.Func`2",
    typeArguments: [float64, float64],
    csharpDelegateSignature: {
      parameters: [float64],
      returnType: float64,
    },
  };

  const result = sourceOwnedProvider(new Map([
    [callee, delegateCarrier],
    [call, float64],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    arguments: [],
  }, fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [bindingElement]]]),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, float64);
});

test("source-owned checked calls close over implicit source class constructor symbols", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const classDeclaration = node("KindClassDeclaration", sourceFile);
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindNewExpression", sourceFile);
  const symbol = { Flags: 0, Name: "Point" };
  const pointType = {
    kind: "target-named",
    id: "Point",
    csharpRender: { kind: "named", name: "Point" },
    csharpSourceDeclarationKind: "class",
  };

  const result = sourceOwnedProvider(new Map([[call, pointType]])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    arguments: [],
  }, fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [classDeclaration]]]),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, pointType);
});

test("source-owned checked calls close over selected declaration return annotations", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const returnType = node("KindNumberKeyword", sourceFile);
  const functionDeclaration = node("KindFunctionDeclaration", sourceFile, { Type: returnType });
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "classify" };
  const float64 = { kind: "source-primitive", name: "float64" };

  const result = sourceOwnedProvider(new Map([
    [returnType, float64],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: functionDeclaration,
    arguments: [],
  }, fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [functionDeclaration]]]),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, float64);
});

test("source-owned checked calls close over callable type return annotations", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const returnType = node("KindNumberKeyword", sourceFile);
  const functionType = node("KindFunctionTypeNode", sourceFile, { Type: returnType });
  const variableDeclaration = node("KindVariableDeclaration", sourceFile, { Type: functionType });
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "callback" };
  const float64 = { kind: "source-primitive", name: "float64" };

  const result = sourceOwnedProvider(new Map([
    [returnType, float64],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: variableDeclaration,
    arguments: [],
  }, fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [variableDeclaration]]]),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, float64);
});

test("source-owned checked calls use TSTS semantic return annotation when direct annotation facts are absent", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const returnType = node("KindNumberKeyword", sourceFile);
  const functionDeclaration = node("KindFunctionDeclaration", sourceFile, { Type: returnType });
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "score" };
  const semanticType = { kind: "semantic-number" };
  const float64 = { kind: "source-primitive", name: "float64" };

  const result = sourceOwnedProvider(new Map([
    [semanticType, float64],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: functionDeclaration,
    arguments: [],
  }, fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [functionDeclaration]]]),
    semanticTypesByTypeNode: new Map([[returnType, semanticType]]),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, float64);
});


function sourceOwnedProvider(targetTypes) {
  return createCsharpNativeOperationsProvider({
    getCsharpTargetBindingByTargetId: () => undefined,
    getCsharpTargetBindingByMetadataName: () => undefined,
    getTargetTypeRefForSubject: (subject, _context, options) => {
      const targetType = targetTypes.get(subject);
      return typeof targetType === "function" ? targetType(options) : targetType;
    },
    getBaseTargetTypeRef: () => undefined,
    getCsharpObjectShapeFactForSubject: () => undefined,
    mapRuntimeCarrier: () => deferObservation,
    getTargetTypeRefForType: (type) => targetTypes.get(type),
  });
}

function fakeObservationContext(options = {}) {
  return {
    facts: {
      get: () => undefined,
      set: () => undefined,
    },
    factResolver: {
      resolve: () => undefined,
    },
    diagnostics: [],
    compiler: {
      ast: {
        kindName: (subject) => subject?.Kind ?? "Undefined",
        getSourceFile: (subject) => subject?.SourceFile,
        getFileName: (sourceFile) => sourceFile.FileName,
        parent: (subject) => subject?.Parent,
        name: (subject) => subject?.name,
        text: (subject) => subject?.Text ?? "",
        is: {
          IsIdentifier: (subject) => subject?.Kind === "KindIdentifier",
          IsPrivateIdentifier: () => false,
          IsQualifiedName: () => false,
          IsPropertyAccessExpression: () => false,
          IsFunctionTypeNode: (subject) => subject?.Kind === "KindFunctionTypeNode",
          IsConstructorTypeNode: (subject) => subject?.Kind === "KindConstructorTypeNode",
        },
      },
      checker: {
        getSymbolAtLocation: () => undefined,
        getResolvedSymbol: () => undefined,
        getResolvedSymbolOrNil: () => undefined,
        getAliasedSymbol: () => undefined,
        getTypeAtLocation: () => undefined,
        getTypeFromTypeNode: (node) => options.semanticTypesByTypeNode?.get(node),
        getTypeSymbol: () => undefined,
        getSymbolDeclarations: (symbol) => options.declarationsBySymbol?.get(symbol) ?? [],
      },
    },
  };
}

function sourceFileNode(fileName) {
  return {
    IsDeclarationFile: false,
    FileName: fileName,
  };
}

function node(kind, sourceFile, fields = {}) {
  return {
    Kind: kind,
    SourceFile: sourceFile,
    ...fields,
  };
}
