import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deferObservation,
  runtimeCarrierFactKey,
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
  const sourceReturnType = { kind: "semantic-number" };
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

  const context = fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [bindingElement]]]),
  });
  const result = sourceOwnedProvider(new Map([
    [callee, delegateCarrier],
    [sourceReturnType, float64],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceReturnType,
    arguments: [],
  }, context);

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
  assert.deepEqual(context.facts.get(call, runtimeCarrierFactKey), { carrier: float64 });
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
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
});

test("source-owned checked calls derive generic class constructor returns from selected declaration and type arguments", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const typeArgument = node("KindTypeReference", sourceFile, { Text: "int32" });
  const classDeclaration = node("KindClassDeclaration", sourceFile, { name: node("KindIdentifier", sourceFile, { Text: "Box" }) });
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindNewExpression", sourceFile, { TypeArguments: { Nodes: [typeArgument] } });
  const symbol = { Flags: 0, Name: "Box" };
  const int32 = { kind: "source-primitive", name: "int32" };

  const result = sourceOwnedProvider(new Map([
    [typeArgument, int32],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: classDeclaration,
    arguments: [],
  }, fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [classDeclaration]]]),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
});

test("source-owned checked calls derive generic explicit-constructor returns from the selected constructor declaration", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const typeArgument = node("KindTypeReference", sourceFile, { Text: "T" });
  const classDeclaration = node("KindClassDeclaration", sourceFile, { name: node("KindIdentifier", sourceFile, { Text: "Wrapper" }) });
  const constructorDeclaration = node("KindConstructor", sourceFile, { Parent: classDeclaration });
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindNewExpression", sourceFile, { TypeArguments: { Nodes: [typeArgument] } });
  const symbol = { Flags: 0, Name: "Wrapper" };
  const typeParameter = { kind: "type-parameter", name: "T" };

  const result = sourceOwnedProvider(new Map([
    [typeArgument, typeParameter],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: constructorDeclaration,
    arguments: [],
  }, fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [constructorDeclaration]]]),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
});

test("source-owned checked calls close over selected declaration return annotations", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const returnType = node("KindNumberKeyword", sourceFile);
  const functionDeclaration = node("KindFunctionDeclaration", sourceFile, { Type: returnType });
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "classify" };
  const float64 = { kind: "source-primitive", name: "float64" };

  const context = fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [functionDeclaration]]]),
  });
  const result = sourceOwnedProvider(new Map([
    [returnType, float64],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: functionDeclaration,
    arguments: [],
  }, context);

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
  assert.deepEqual(context.facts.get(call, runtimeCarrierFactKey), { carrier: float64 });
});

test("source-owned checked calls do not close raw TypeScript array annotations as native array returns", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const returnType = node("KindArrayType", sourceFile);
  const functionDeclaration = node("KindFunctionDeclaration", sourceFile, { Type: returnType });
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "compose" };
  const rawSourceArray = {
    kind: "array",
    element: { kind: "source-primitive", name: "int32" },
  };

  const result = sourceOwnedProvider(new Map([
    [returnType, rawSourceArray],
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
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
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

  const context = fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [variableDeclaration]]]),
  });
  const result = sourceOwnedProvider(new Map([
    [returnType, float64],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: variableDeclaration,
    arguments: [],
  }, context);

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
  assert.deepEqual(context.facts.get(call, runtimeCarrierFactKey), { carrier: float64 });
});

test("source-owned checked calls keep function-declaration callable returns as delegate carriers", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const returnType = node("KindNumberKeyword", sourceFile);
  const functionType = node("KindFunctionTypeNode", sourceFile, { Type: returnType, Parameters: { Nodes: [] } });
  const functionDeclaration = node("KindFunctionDeclaration", sourceFile, { Type: functionType });
  const callee = node("KindIdentifier", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "makeCounter" };
  const float64 = { kind: "source-primitive", name: "float64" };
  const delegateCarrier = {
    kind: "target-named",
    id: "System.Func`1",
    typeArguments: [float64],
    csharpDelegateSignature: {
      parameters: [],
      returnType: float64,
    },
  };

  const context = fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [functionDeclaration]]]),
  });
  const result = sourceOwnedProvider(new Map([
    [returnType, float64],
    [functionType, delegateCarrier],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: functionDeclaration,
    arguments: [],
  }, context);

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
  assert.deepEqual(context.facts.get(call, runtimeCarrierFactKey), { carrier: delegateCarrier });
});

test("source-owned checked calls do not query the call expression for TSTS-instantiated generic method returns", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const typeParameterReturn = node("KindTypeReference", sourceFile, { Text: "Transformer<U>" });
  const methodDeclaration = node("KindMethodDeclaration", sourceFile, { Type: typeParameterReturn });
  const callee = node("KindPropertyAccessExpression", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "map" };
  const stringType = { kind: "source-primitive", name: "string" };
  const uninstantiatedReturn = {
    kind: "target-named",
    id: "Transformer",
    typeArguments: [{ kind: "type-parameter", name: "U" }],
    csharpRender: { kind: "named", name: "Transformer" },
    csharpSourceDeclarationKind: "class",
  };
  const instantiatedReturn = {
    kind: "target-named",
    id: "Transformer",
    typeArguments: [stringType],
    csharpRender: { kind: "named", name: "Transformer" },
    csharpSourceDeclarationKind: "class",
  };

  const context = fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [methodDeclaration]]]),
  });
  const result = sourceOwnedProvider(new Map([
    [call, (options) => options?.allowSemanticTypeQuery === false ? undefined : instantiatedReturn],
    [typeParameterReturn, uninstantiatedReturn],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: methodDeclaration,
    arguments: [],
  }, context);

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
  assert.equal(context.facts.get(call, runtimeCarrierFactKey), undefined);
});

test("source-owned checked calls close over TSTS-selected semantic return types", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const typeParameterReturn = node("KindTypeReference", sourceFile, { Text: "Transformer<U>" });
  const methodDeclaration = node("KindMethodDeclaration", sourceFile, { Type: typeParameterReturn });
  const callee = node("KindPropertyAccessExpression", sourceFile);
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "map" };
  const sourceReturnType = { kind: "semantic-transformer-string" };
  const stringType = { kind: "source-primitive", name: "string" };
  const uninstantiatedReturn = {
    kind: "target-named",
    id: "Transformer",
    typeArguments: [{ kind: "type-parameter", name: "U" }],
    csharpRender: { kind: "named", name: "Transformer" },
    csharpSourceDeclarationKind: "class",
  };
  const instantiatedReturn = {
    kind: "target-named",
    id: "Transformer",
    typeArguments: [stringType],
    csharpRender: { kind: "named", name: "Transformer" },
    csharpSourceDeclarationKind: "class",
  };

  const context = fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [methodDeclaration]]]),
  });
  const result = sourceOwnedProvider(new Map([
    [sourceReturnType, instantiatedReturn],
    [typeParameterReturn, uninstantiatedReturn],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: methodDeclaration,
    sourceReturnType,
    arguments: [],
  }, context);

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
  assert.deepEqual(context.facts.get(call, runtimeCarrierFactKey), { carrier: instantiatedReturn });
});

test("source-owned checked calls prefer receiver type-argument facts over numeric semantic return types", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const typeParameterName = node("KindIdentifier", sourceFile, { Text: "T" });
  const typeParameter = node("KindTypeParameter", sourceFile, { name: typeParameterName });
  const receiverTypeArgument = node("KindTypeReference", sourceFile, { Text: "int32" });
  const receiver = node("KindNewExpression", sourceFile, { TypeArguments: { Nodes: [receiverTypeArgument] } });
  const callee = node("KindPropertyAccessExpression", sourceFile, { Expression: receiver });
  const returnType = node("KindTypeReference", sourceFile, { Text: "Transformer<T>" });
  const classDeclaration = node("KindClassDeclaration", sourceFile, { TypeParameters: { Nodes: [typeParameter] } });
  const methodDeclaration = node("KindMethodDeclaration", sourceFile, { Type: returnType, Parent: classDeclaration });
  const call = node("KindCallExpression", sourceFile);
  const symbol = { Flags: 0, Name: "replace" };
  const int32 = { kind: "source-primitive", name: "int32" };
  const float64 = { kind: "source-primitive", name: "float64" };
  const receiverCarrier = {
    kind: "target-named",
    id: "Transformer",
    typeArguments: [int32],
    csharpRender: { kind: "named", name: "Transformer" },
    csharpSourceDeclarationKind: "class",
  };
  const annotatedReturn = {
    kind: "target-named",
    id: "Transformer",
    typeArguments: [{ kind: "type-parameter", name: "T" }],
    csharpRender: { kind: "named", name: "Transformer" },
    csharpSourceDeclarationKind: "class",
  };
  const broadSemanticReturn = {
    kind: "target-named",
    id: "Transformer",
    typeArguments: [float64],
    csharpRender: { kind: "named", name: "Transformer" },
    csharpSourceDeclarationKind: "class",
  };
  const sourceReturnType = { kind: "semantic-transformer-number" };

  const context = fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [methodDeclaration]]]),
  });
  const result = sourceOwnedProvider(new Map([
    [receiver, receiverCarrier],
    [receiverTypeArgument, int32],
    [returnType, annotatedReturn],
    [sourceReturnType, broadSemanticReturn],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: methodDeclaration,
    sourceReturnType,
    arguments: [],
  }, context);

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
  assert.deepEqual(context.facts.get(call, runtimeCarrierFactKey), { carrier: receiverCarrier });
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

  const context = fakeObservationContext({
    declarationsBySymbol: new Map([[symbol, [functionDeclaration]]]),
    semanticTypesByTypeNode: new Map([[returnType, semanticType]]),
  });
  const result = sourceOwnedProvider(new Map([
    [semanticType, float64],
  ])).mapCheckedCall({
    target: "csharp",
    call,
    callee,
    sourceCalleeSymbol: symbol,
    sourceSelectedDeclaration: functionDeclaration,
    arguments: [],
  }, context);

  assert.equal(result.kind, "accept");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.equal(result.value.selectedSignature.member.returnType, undefined);
  assert.deepEqual(context.facts.get(call, runtimeCarrierFactKey), { carrier: float64 });
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
  const factStore = new Map();
  return {
    facts: {
      get: (subject, key) => factStore.get(subject)?.get(key),
      set: (subject, key, value) => {
        let subjectFacts = factStore.get(subject);
        if (subjectFacts === undefined) {
          subjectFacts = new Map();
          factStore.set(subject, subjectFacts);
        }
        subjectFacts.set(key, value);
      },
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
        typeArguments: (subject) => subject?.TypeArguments?.Nodes ?? [],
        typeParameters: (subject) => subject?.TypeParameters?.Nodes ?? [],
        is: new Proxy({
          IsIdentifier: (subject) => subject?.Kind === "KindIdentifier",
          IsPrivateIdentifier: () => false,
          IsQualifiedName: () => false,
          IsPropertyAccessExpression: (subject) => subject?.Kind === "KindPropertyAccessExpression",
          IsFunctionTypeNode: (subject) => subject?.Kind === "KindFunctionTypeNode",
          IsConstructorTypeNode: (subject) => subject?.Kind === "KindConstructorTypeNode",
        }, { get: (target, property) => target[property] ?? (() => false) }),
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
