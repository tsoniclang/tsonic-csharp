import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompilerSessionFromFiles, formatDiagnostics, providerVirtualDeclarationFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, targetOperationFactKey } from "@tsonic/tsts";
import { createTsonicCoreSourceExtension } from "@tsonic/source-core";
import { csharpArrayBoundaryFactKey, csharpSourceProfileDeclarationFactKey, csharpSourceReturnCarrierFactKey, csharpTargetIterationFactKey, csharpTargetMutationOperationFactKey, csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import {
  createCsharpJsSurfaceExtension,
  createCsharpSourceSemanticsExtension,
  createCsharpTargetSemanticsExtension,
} from "../dist/index.js";
import {
  csharpJsSourceProfileOwnerId,
  csharpJsSurfaceSourceProfileContributions,
  csharpSourceProfileContributions,
  csharpSourceProfileOwnerId,
} from "../dist/source/csharp-source-semantics/source-profile-declarations.js";
import { planArrayLiteralExpressionWithCarrier } from "../dist/backend/planner/array-literals/index.js";
import { createCsharpNativeOperationsProvider } from "../dist/source/csharp-source-semantics/operations-provider.js";
import {
  createCsharpJsSurfaceOperationsProvider as createProductCsharpJsSurfaceOperationsProvider,
} from "../dist/source/csharp-source-semantics/surface-extensions.js";
import { mapCsharpJsSurfaceCheckedIteration } from "../dist/source/csharp-source-semantics/surfaces/js/iteration.js";
import { csharpJsMapCollectionPolicy } from "../dist/source/csharp-source-semantics/surfaces/js/collection-target-metadata/map-metadata.js";
import { csharpJsSetCollectionPolicy } from "../dist/source/csharp-source-semantics/surfaces/js/collection-target-metadata/set-metadata.js";
export { test, assert, createCompilerSessionFromFiles, formatDiagnostics, providerVirtualDeclarationFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, targetOperationFactKey, createTsonicCoreSourceExtension, csharpArrayBoundaryFactKey, csharpSourceProfileDeclarationFactKey, csharpSourceReturnCarrierFactKey, csharpTargetIterationFactKey, csharpTargetMutationOperationFactKey, csharpTargetOperationFactKey, createCsharpJsSurfaceExtension, createCsharpSourceSemanticsExtension, createCsharpTargetSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, planArrayLiteralExpressionWithCarrier, createCsharpNativeOperationsProvider, createProductCsharpJsSurfaceOperationsProvider, mapCsharpJsSurfaceCheckedIteration, csharpJsMapCollectionPolicy, csharpJsSetCollectionPolicy };

const sourceProfileDeclarationFacts = new WeakMap();

export function createCsharpJsSurfaceOperationsProvider(host) {
  return createProductCsharpJsSurfaceOperationsProvider({ operationsProviderHost: host });
}

































































































































export function arrayLengthRequest(expression, receiverType, sourceSelectedSymbol, options = {}) {
  return sourceLibraryPropertyRequest(expression, sourceSelectedSymbol, "length", {
    ...options,
    receiverType,
  });
}

export function arrayLengthDeclaration() {
  return arrayMemberDeclaration("length");
}

export function arrayMemberDeclaration(memberName) {
  return sourceLibraryMemberDeclaration("Array", memberName);
}

export function arrayConstructorDeclaration() {
  return sourceLibraryMemberDeclaration("ArrayConstructor", "");
}

export function sourceLibraryMemberDeclaration(declaringName, memberName, fileName = "/src/.tsonic/source-profiles/js/js.d.ts") {
  const sourceFile = { FileName: fileName };
  const declaringDeclaration = { Kind: 1, Name: { Text: declaringName }, SourceFile: sourceFile };
  const declaration = {
    Kind: 1,
    Name: { Text: memberName },
    Parent: declaringDeclaration,
    SourceFile: sourceFile,
  };
  const ownerId = sourceProfileOwnerIdForFixture(fileName);
  if (ownerId !== undefined) {
    sourceProfileDeclarationFacts.set(declaringDeclaration, {
      ownerId,
      kind: "type",
      name: declaringName,
    });
    sourceProfileDeclarationFacts.set(declaration, {
      ownerId,
      kind: "member",
      name: memberName,
      declaringName,
    });
  }
  return declaration;
}

function sourceProfileOwnerIdForFixture(fileName) {
  for (const ownerId of [csharpJsSourceProfileOwnerId, csharpSourceProfileOwnerId]) {
    if (fileName.includes(`/.tsonic/source-profiles/${ownerId}/`)) {
      return ownerId;
    }
  }
  return undefined;
}

export function namespaceImportSourceFile(receiver, localName, moduleSpecifier) {
  const sourceFile = { Kind: "SourceFile", Children: [] };
  receiver.SourceFile = sourceFile;
  sourceFile.Children = [{
    Kind: "ImportDeclaration",
    ImportClause: {
      Kind: "ImportClause",
      NamedBindings: {
        Kind: "NamespaceImport",
        Name: { Kind: "Identifier", Text: localName },
      },
    },
    ModuleSpecifier: { Kind: "StringLiteral", Text: `"${moduleSpecifier}"` },
    SourceFile: sourceFile,
  }];
  return sourceFile;
}

export function fakeNamespaceImportContext(facts, sourceFile) {
  return {
    facts,
    factResolver: {
      resolve: () => undefined,
    },
    compiler: {
      ast: {
        is: fakeAstIs({
          IsIdentifier: (node) => node?.Kind === "Identifier",
          IsImportDeclaration: (node) => node?.Kind === "ImportDeclaration",
        }),
        kindName: (node) => typeof node?.Kind === "string" ? node.Kind : "",
        as: {
          AsPropertyAccessExpression: (node) => node?.Kind === "PropertyAccessExpression" ? node : undefined,
          AsElementAccessExpression: (node) => node?.Kind === "ElementAccessExpression" ? node : undefined,
          AsCallExpression: (node) => node?.Kind === "CallExpression" ? node : undefined,
          AsNewExpression: (node) => node?.Kind === "NewExpression" ? node : undefined,
        },
        as: {
          AsImportDeclaration: (node) => node?.Kind === "ImportDeclaration" ? node : undefined,
          AsImportClause: (node) => node?.Kind === "ImportClause" ? node : undefined,
          AsNamespaceImport: (node) => node?.Kind === "NamespaceImport" ? node : undefined,
        },
        children: (node) => node?.Children ?? [],
        typeArguments: () => [],
        typeParameters: () => [],
        parameters: () => [],
        members: () => [],
        elements: () => [],
        properties: () => [],
        arguments: () => [],
        getSourceFile: (node) => node?.SourceFile ?? (node === sourceFile ? sourceFile : undefined),
        getFileName: (node) => node?.FileName ?? "",
        parent: (node) => node?.Parent,
        name: (node) => node?.Name,
        text: (node) => node?.Text ?? "",
        typeArguments: (node) => node?.TypeArguments?.Nodes ?? [],
      },
      checker: {
        getSignatureDeclaration: (signature) => signature?.declaration,
        getSymbolDeclarations: () => [],
        getTypeAtLocation: () => undefined,
        getTypeSymbol: () => undefined,
        getSymbolAtLocation: () => undefined,
        getResolvedSymbolOrNil: () => undefined,
        getResolvedSymbol: () => undefined,
        getAliasedSymbol: () => undefined,
      },
    },
  };
}

export function sourceLibraryPropertyRequest(expression, sourceSelectedSymbol, propertyName, options = {}) {
  const receiver = fakeNodeSubject(options.receiver ?? {});
  const selectedDeclaration = sourceSelectedSymbol?.Kind !== undefined ? sourceSelectedSymbol : options.sourceSelectedDeclaration;
  const selectedSymbol = sourceSelectedSymbol?.Kind === undefined ? sourceSelectedSymbol : options.sourceSelectedSymbol;
  const receiverType = options.receiverType ?? receiver.SemanticType ?? receiver;
  const resultType = options.sourceResultType ?? expression;
  return {
    target: "csharp",
    expression,
    receiver,
    propertyName,
    accessMode: options.accessMode ?? "read",
    callCallee: options.callCallee ?? false,
    sourceReceiver: selectedSourceValueEvidence(receiver, receiverType),
    sourceResult: selectedSourceValueEvidence(expression, resultType, {
      selectedDeclaration,
      selectedSymbol,
    }),
    ...(options.optionalChain === undefined ? {} : { optionalChain: options.optionalChain }),
  };
}

export function fakeNodeSubject(subject, kind = "Identifier") {
  if (subject !== undefined && subject !== null && typeof subject === "object" && subject.Kind === undefined) {
    subject.Kind = kind;
  }
  return subject;
}

export function fakeHost(receiverType, targetTypes = new Map(), targetBinding, objectShapeFacts = new Map()) {
  return {
    ...(targetBinding === undefined ? {} : { getCsharpTargetBindingByTargetId: (targetId) => targetId === targetBinding.id ? targetBinding : undefined }),
    ...(targetBinding === undefined ? {} : { getCsharpTargetBindingByMetadataName: (metadataName) => metadataName === "System.Collections.Generic.Dictionary`2" ? targetBinding : undefined }),
    getTargetTypeRefForSubject: (subject, context) => targetTypes.get(subject) ??
      targetTypes.get(subject?.TargetType) ??
      targetTypes.get(subject?.SemanticType) ??
      context?.factResolver?.resolve(subject, runtimeCarrierFactKey)?.carrier ??
      context?.factResolver?.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
      (receiverType !== undefined && subject === receiverType
      ? { kind: "array", element: { kind: "source-primitive", name: "int32" } }
      : undefined),
    getCsharpObjectShapeFactForSubject: (subject) => objectShapeFacts.get(subject),
    mapRuntimeCarrier: () => ({ kind: "defer" }),
  };
}

export function fakeContext(facts) {
  return {
    facts,
    factResolver: {
      resolve: (subject, key) => facts.get(subject, key) ??
        (key === csharpSourceProfileDeclarationFactKey ? sourceProfileDeclarationFacts.get(subject) : undefined),
    },
    extensionId: "tsonic.csharp.surface.js",
    phase: "finalization",
  };
}

export function fakeAstIs(overrides = {}) {
  return new Proxy(overrides, {
    get(target, property) {
      if (property in target) {
        return target[property];
      }
      return () => false;
    },
  });
}

export function createCsharpSession(sourceText, options = {}) {
  const target = {
    id: "csharp",
    ...(options.typescriptCompatibility === undefined ? {} : { options: { typescriptCompatibility: options.typescriptCompatibility } }),
  };
  const context = {
    project: {
      entryPoint: "index.ts",
      targets: [target],
    },
    target,
    selectedSurfaces: options.selectedSurfaces ?? [],
  };
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ...sourceProfileFiles(context).map((file) => [file.path, file.text]),
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
      target: "es2022",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createTsonicCoreSourceExtension(),
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
        ...context.selectedSurfaces.flatMap((surface) =>
          surface.id === "js"
            ? [createCsharpJsSurfaceExtension({ ...context, surface, targetPack: fakeTargetPack })]
            : []
        ),
      ],
    },
  });
}

export function sourceProfileFiles(context) {
  if (context.selectedSurfaces.some((surface) => surface.id === "js")) {
    const declarations = csharpJsSurfaceSourceProfileContributions().declarations ?? [];
    return declarationFiles(csharpJsSourceProfileOwnerId, declarations);
  }
  const declarations = csharpSourceProfileContributions({
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
    target: context.target,
    targetPack: fakeTargetPack,
    selectedCapabilities: [],
    selectedSurfaces: context.selectedSurfaces,
  }).declarations ?? [];
  return declarationFiles(csharpSourceProfileOwnerId, declarations);
}

export function declarationFiles(ownerId, declarations) {
  return declarations.map((declaration) => ({
    path: `/src/.tsonic/source-profiles/${ownerId}/${declaration.fileName}`,
    text: declaration.text,
  }));
}

export const fakeTargetPack = {
  id: "csharp",
  displayName: "C#",
};

export function collectNodesByKind(node, ast, kindName, result = []) {
  if (node === undefined) {
    return result;
  }
  if (ast.kindName(node) === kindName) {
    result.push(node);
  }
  for (const child of ast.children(node) ?? []) {
    collectNodesByKind(child, ast, kindName, result);
  }
  return result;
}

export function collectFactValues(sourceFile, session, extensionHost, factKey) {
  return collectAllNodes(sourceFile, session.ast)
    .map((node) => extensionHost.facts.get(node, factKey))
    .filter((fact) => fact !== undefined);
}

export function collectAllNodes(node, ast, result = []) {
  if (node === undefined) {
    return result;
  }
  result.push(node);
  for (const child of ast.children(node) ?? []) {
    collectAllNodes(child, ast, result);
  }
  return result;
}

export function jsCallRequest(call, sourceSelectedDeclaration, options = {}) {
  const sourceCall = fakeNodeSubject(call, call?.Kind ?? "CallExpression");
  const callee = fakeCallCallee(options);
  const sourceArguments = (options.arguments ?? []).map((argument) => fakeNodeSubject(argument));
  const selectedCalleeDeclaration = options.sourceSelectedCalleeDeclaration ?? sourceSelectedDeclaration;
  const sourceArgumentBindings = options.sourceArgumentBindings ?? sourceArguments.map((argument, index) => ({
    sourceArgumentIndex: index,
    effectiveArgumentIndex: index,
    sourceForm: "value",
    sourceParameterIndex: index,
    sourceParameterForm: "parameter",
    selectedArgumentType: options.sourceArgumentTypes?.[index] ?? argument,
    selectedParameterType: options.sourceParameterTypes?.[index] ?? options.sourceArgumentTypes?.[index] ?? argument,
  }));
  return {
    target: "csharp",
    call: sourceCall,
    callee,
    arguments: sourceArguments,
    callKind: isConstructCall(sourceCall) ? "construct" : "call",
    sourceSelectedDeclaration,
    sourceSelectedSignature: options.sourceSelectedSignature ?? selectedSourceLibrarySignature(sourceSelectedDeclaration),
    sourceSelectedSignatureKind: options.sourceSelectedSignatureKind ?? "resolved",
    sourceArgumentBindings,
    sourceCallee: selectedSourceValueEvidence(callee, options.sourceCalleeType ?? callee, {
      declaration: options.sourceCalleeDeclaration,
      symbol: options.sourceCalleeSymbol,
      selectedDeclaration: selectedCalleeDeclaration,
      selectedSymbol: options.sourceSelectedCalleeSymbol,
    }),
    sourceArguments: sourceArguments.map((argument, index) =>
      selectedSourceValueEvidence(argument, options.sourceArgumentTypes?.[index] ?? argument)),
    sourceResult: selectedSourceValueEvidence(sourceCall, options.sourceResultType ?? sourceCall),
    ...(options.calleeReceiver === undefined
      ? {}
      : { sourceReceiver: selectedSourceValueEvidence(options.calleeReceiver, options.sourceReceiverType ?? options.calleeReceiver) }),
    ...(options.optionalChain === undefined ? {} : { optionalChain: options.optionalChain }),
  };
}

export function jsCallRequestWithoutSignature(call, sourceSelectedDeclaration, options = {}) {
  const request = jsCallRequest(call, sourceSelectedDeclaration, options);
  const {
    sourceSelectedSignature: _sourceSelectedSignature,
    sourceSelectedSignatureKind: _sourceSelectedSignatureKind,
    sourceArgumentBindings: _sourceArgumentBindings,
    ...withoutSignature
  } = request;
  return withoutSignature;
}

function isConstructCall(call) {
  return call?.Kind === "NewExpression" || call?.Kind === "KindNewExpression";
}

export function selectedSourceValueEvidence(expression, type = expression, options = {}) {
  return {
    expression,
    type,
    ...(options.symbol === undefined ? {} : { symbol: options.symbol }),
    ...(options.declaration === undefined ? {} : { declaration: options.declaration }),
    ...(options.selectedSymbol === undefined ? {} : { selectedSymbol: options.selectedSymbol }),
    ...(options.selectedDeclaration === undefined ? {} : { selectedDeclaration: options.selectedDeclaration }),
    ...(options.authoredTypeNode === undefined ? {} : { authoredTypeNode: options.authoredTypeNode }),
  };
}

export function fakeCallCallee(options = {}) {
  if (options.callee !== undefined) {
    return fakeNodeSubject(options.callee, options.callee.Kind ?? "Identifier");
  }
  if (options.calleeReceiver === undefined) {
    return fakeNodeSubject({}, "Identifier");
  }
  return {
    Kind: "PropertyAccessExpression",
    Expression: fakeNodeSubject(options.calleeReceiver),
    Name: { Kind: "Identifier", Text: "member" },
  };
}

export function selectedSourceLibrarySignature(sourceSelectedDeclaration) {
  return { declaration: sourceSelectedDeclaration };
}

export function nodejsCallRequest(call, sourceSelectedSignature) {
  return {
    target: "csharp",
    call,
    callee: {},
    arguments: [],
    sourceSelectedSignature,
  };
}

export function nodejsCallRequestWithoutSignature(call, sourceSelectedDeclaration) {
  return {
    target: "csharp",
    call,
    callee: {},
    arguments: [],
    sourceSelectedDeclaration,
  };
}

export function nodejsPropertyRequest(expression, sourceSelectedSymbol) {
  return {
    target: "csharp",
    expression,
    receiver: {},
    receiverType: {},
    propertyName: "platform",
    sourceSelectedSymbol,
  };
}

export function nodejsVirtualDeclaration(moduleSpecifier, exportName, signatureId) {
  return {
    providerId: "tsonic.csharp.provider-package.nodejs",
    providerVersion: "0.0.1",
    providerModuleId: moduleSpecifier,
    moduleSpecifier,
    artifactFileName: `tsts-provider://csharp-nodejs/${encodeURIComponent(moduleSpecifier)}.d.ts`,
    exportName,
    ...(signatureId !== undefined ? { signatureId } : {}),
  };
}

export function nodejsVirtualMemberDeclaration(moduleSpecifier, exportName, memberName, memberId, signatureId) {
  return {
    ...nodejsVirtualDeclaration(moduleSpecifier, exportName),
    memberName,
    memberId,
    ...(signatureId !== undefined ? { signatureId } : {}),
  };
}

export function int32Type() {
  return { kind: "source-primitive", name: "int32" };
}

export function float64Type() {
  return { kind: "source-primitive", name: "float64" };
}

export function boolType() {
  return { kind: "source-primitive", name: "bool" };
}

export function nullishType() {
  return { kind: "test-nullish" };
}

export function stringType() {
  return {
    kind: "target-named",
    id: "System.String",
    csharpRender: { kind: "predefined", name: "string" },
    csharpSpecialType: "string",
    csharpTypeofRuntimeKind: "string",
  };
}

export function regexpType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.RegExp",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "RegExp" },
    csharpJsSurfaceKind: "regexp",
  };
}

export function dateType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.Date",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "Date" },
    csharpJsSurfaceKind: "date",
  };
}

export function jsObjectType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.JSObject",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "JSObject" },
  };
}

export function tsValueType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.TsValue",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "TsValue" },
  };
}

export function jsArrayType(elementType) {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.JSArray`1",
    typeArguments: [elementType],
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "JSArray" },
    arrayLiteralElementType: elementType,
    csharpEnumerableElementType: elementType,
    csharpReadOnlyIndexableElementType: elementType,
  };
}

export function jsMapType(keyType, valueType) {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.Map`2",
    typeArguments: [keyType, valueType],
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "Map" },
    csharpEnumerableElementType: { kind: "tuple", elements: [keyType, valueType] },
    csharpJsSurfaceKind: "map",
  };
}

export function jsSetType(elementType) {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.Set`1",
    typeArguments: [elementType],
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "Set" },
    csharpEnumerableElementType: elementType,
    csharpJsSurfaceKind: "set",
  };
}

export function int32ArrayType() {
  return { kind: "array", element: int32Type() };
}

export function int32EnumerableType() {
  return genericSystemCollectionType("IEnumerable", int32Type(), {
    csharpArrayLiteralElementType: int32Type(),
    csharpEnumerableElementType: int32Type(),
  });
}

export function int32ReadOnlyListType() {
  return genericSystemCollectionType("IReadOnlyList", int32Type(), {
    csharpArrayLiteralElementType: int32Type(),
    csharpEnumerableElementType: int32Type(),
    csharpReadOnlyIndexableElementType: int32Type(),
  });
}

export function genericSystemCollectionType(name, elementType, extras = {}) {
  return {
    kind: "target-named",
    id: `System.Collections.Generic.${name}\`1`,
    typeArguments: [elementType],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name },
    ...extras,
  };
}

export function recordDictionaryType(keyType, valueType) {
  return {
    kind: "target-named",
    id: "System.Collections.Generic.Dictionary`2",
    typeArguments: [keyType, valueType],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary" },
    csharpCollectionSurface: "record",
  };
}

export function surfaceObjectShapeFact(name, members) {
  return {
    targetType: {
      kind: "target-named",
      id: `Test.${name}`,
      csharpRender: { kind: "named", namespace: ["Test"], name },
    },
    members,
  };
}

export function dictionaryBinding() {
  const declarationType = {
    kind: "target-named",
    id: "System.Collections.Generic.Dictionary`2",
    typeArguments: [{ kind: "type-parameter", name: "TKey" }, { kind: "type-parameter", name: "TValue" }],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary" },
  };
  return {
    target: "csharp",
    id: "System.Collections.Generic.Dictionary`2",
    typeParameters: [{ name: "TKey" }, { name: "TValue" }],
    csharpType: declarationType,
    members: [{
      id: "System.Collections.Generic.Dictionary`2.Item(TKey)",
      sourceName: "item",
      targetName: "Item",
      kind: "indexer",
      declaringType: declarationType,
      parameters: [{ name: "key", type: { kind: "type-parameter", name: "TKey" }, passingMode: "by-value" }],
      returnType: { kind: "type-parameter", name: "TValue" },
      overloadGroup: "System.Collections.Generic.Dictionary`2.Item(TKey)",
    }, {
      id: "System.Collections.Generic.Dictionary`2.Keys",
      sourceName: "keys",
      targetName: "Keys",
      kind: "property",
      declaringType: declarationType,
      parameters: [],
      returnType: {
        kind: "target-named",
        id: "System.Collections.Generic.Dictionary`2.KeyCollection",
        typeArguments: [{ kind: "type-parameter", name: "TKey" }, { kind: "type-parameter", name: "TValue" }],
        csharpRender: { kind: "nested", outer: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary" }, name: "KeyCollection" },
      },
    }],
  };
}

export function actionOfInt32Type() {
  return {
    kind: "target-named",
    id: "System.Action`1",
    typeArguments: [int32Type()],
  };
}

export function funcInt32ToStringType() {
  return {
    kind: "target-named",
    id: "System.Func`2",
    typeArguments: [int32Type(), stringType()],
    csharpDelegateSignature: {
      parameters: [int32Type()],
      returnType: stringType(),
    },
  };
}

export class TestFactStore {
  #facts = new Map();

  get(subject, key) {
    return this.#facts.get(subject)?.get(key);
  }

  set(subject, key, value) {
    let subjectFacts = this.#facts.get(subject);
    if (subjectFacts === undefined) {
      subjectFacts = new Map();
      this.#facts.set(subject, subjectFacts);
    }
    subjectFacts.set(key, value);
  }
}
