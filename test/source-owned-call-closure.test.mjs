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
  const symbol = { Name: "run" };
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
  const symbol = { Name: "Point" };
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

function sourceOwnedProvider(targetTypes) {
  return createCsharpNativeOperationsProvider({
    getCsharpTargetBindingByTargetId: () => undefined,
    getCsharpTargetBindingByMetadataName: () => undefined,
    getTargetTypeRefForSubject: (subject) => targetTypes.get(subject),
    getBaseTargetTypeRef: () => undefined,
    getCsharpObjectShapeFactForSubject: () => undefined,
    mapRuntimeCarrier: () => deferObservation,
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
        },
      },
      checker: {
        getSymbolAtLocation: () => undefined,
        getResolvedSymbol: () => undefined,
        getResolvedSymbolOrNil: () => undefined,
        getAliasedSymbol: () => undefined,
        getTypeAtLocation: () => undefined,
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

function node(kind, sourceFile) {
  return {
    Kind: kind,
    SourceFile: sourceFile,
  };
}
