import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeCarrierFactKey, selectedTargetSignatureFactKey } from "@tsonic/tsts";
import { createCsharpJsSurfaceOperationsProvider as createProductCsharpJsSurfaceOperationsProvider } from "../dist/source/csharp-source-semantics/surface-extensions.js";

function createCsharpJsSurfaceOperationsProvider(host) {
  return createProductCsharpJsSurfaceOperationsProvider({ operationsProviderHost: host });
}

test("JS surface maps exact Number formatting methods from selected identity and closed receiver facts", () => {
  const receiver = {};
  const digits = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(new Map([
    [receiver, float64Type()],
    [digits, int32Type()],
  ])));

  const fixedResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Number", "toFixed"), {
    arguments: [digits],
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const precisionResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Number", "toPrecision"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(fixedResult.kind, "accept");
  assert.equal(fixedResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Number.toFixed");
  assert.equal(fixedResult.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(precisionResult.kind, "accept");
  assert.equal(precisionResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Number.toPrecision");
});

test("JS surface rejects Number locale formatting without Intl facts", () => {
  const receiver = {};
  const locale = {};
  const options = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(new Map([
    [receiver, float64Type()],
    [locale, stringType()],
    [options, jsObjectType()],
  ])));

  const localeResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Number", "toLocaleString"), {
    arguments: [locale, options],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(localeResult.kind, "reject");
  assert.equal(localeResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(localeResult.diagnostic.message, /Number\.toLocaleString/);
  assert.match(localeResult.diagnostic.message, /Intl\.NumberFormat-compatible locale and options semantics/);
});

test("JS surface rejects Number formatting methods without required closed facts", () => {
  const receiver = {};
  const digits = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(new Map([
    [digits, stringType()],
  ])));

  const missingReceiver = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Number", "toExponential"), {
    arguments: [digits],
    calleeReceiver: receiver,
  }), fakeContext(facts));
  const wrongDigits = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Number", "toFixed"), {
    arguments: [digits],
    calleeReceiver: digits,
  }), fakeContext(facts));

  assert.equal(missingReceiver.kind, "reject");
  assert.equal(missingReceiver.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(missingReceiver.diagnostic.message, /Number\.toExponential/);
  assert.match(missingReceiver.diagnostic.message, /receiver lacks finalized target runtime facts/);
  assert.equal(wrongDigits.kind, "reject");
  assert.equal(wrongDigits.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
});

test("JS surface maps Object.is from selected identity and closed argument facts", () => {
  const left = {};
  const right = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(new Map([
    [left, stringType()],
    [right, float64Type()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("ObjectConstructor", "is"), {
    arguments: [left, right],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.is");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});

test("JS surface rejects Object.is without closed argument target facts", () => {
  const left = {};
  const right = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(new Map([
    [left, stringType()],
  ])));

  const result = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("ObjectConstructor", "is"), {
    arguments: [left, right],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /argument 2/);
});

test("JS surface hard-rejects Object prototype and descriptor operations with explicit evidence", () => {
  const value = {};
  const descriptor = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(new Map([
    [value, jsObjectType()],
    [descriptor, jsObjectType()],
  ])));

  const createResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("ObjectConstructor", "create"), {
    arguments: [value],
  }), fakeContext(facts));
  const definePropertyResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("ObjectConstructor", "defineProperty"), {
    arguments: [value, stringType(), descriptor],
  }), fakeContext(facts));

  assert.equal(createResult.kind, "reject");
  assert.equal(createResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(createResult.diagnostic.message, /Object\.create/);
  assert.match(createResult.diagnostic.message, /descriptor, prototype, extensibility/);
  assert.equal(createResult.diagnostic.evidence[0].details.capabilityId, "surface.js.object-runtime");
  assert.equal(definePropertyResult.kind, "reject");
  assert.equal(definePropertyResult.diagnostic.extensionCode, "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED");
  assert.match(definePropertyResult.diagnostic.message, /Object\.defineProperty/);
});

test("JS surface maps RegExp construction and toString from selected identities and closed facts", () => {
  const construct = { Kind: "KindNewExpression" };
  const pattern = {};
  const flags = {};
  const receiver = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(new Map([
    [pattern, stringType()],
    [flags, stringType()],
    [receiver, regexpType()],
  ])));

  const constructResult = provider.mapCheckedCall(jsCallRequest(construct, sourceLibraryMemberDeclaration("RegExpConstructor", ""), {
    arguments: [pattern, flags],
  }), fakeContext(facts));
  const toStringResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("RegExp", "toString"), {
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(constructResult.kind, "accept");
  assert.equal(constructResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.RegExp..ctor(System.String,System.String)");
  assert.equal(constructResult.value.selectedSignature.member.kind, "constructor");
  assert.equal(toStringResult.kind, "accept");
  assert.equal(toStringResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.RegExp.toString");
  assert.equal(toStringResult.value.selectedSignature.member.returnType.id, "System.String");
});

test("JS surface maps console profile methods and rejects invalid label facts", () => {
  const label = {};
  const badLabel = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(new Map([
    [label, stringType()],
    [badLabel, float64Type()],
  ])));

  const profileResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "profile"), {
    arguments: [label],
  }), fakeContext(facts));
  const profileEndResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "profileEnd"), {
    arguments: [badLabel],
  }), fakeContext(facts));

  assert.equal(profileResult.kind, "accept");
  assert.equal(profileResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.profile");
  assert.equal(profileEndResult.kind, "reject");
  assert.equal(profileEndResult.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
});

function sourceLibraryMemberDeclaration(declaringName, memberName, fileName = "/src/.tsonic/source-profiles/js/js.d.ts") {
  const sourceFile = { FileName: fileName };
  const parent = { Kind: 1, Name: { Text: declaringName }, SourceFile: sourceFile };
  return {
    Kind: 1,
    Name: { Text: memberName },
    Parent: parent,
    SourceFile: sourceFile,
  };
}

function jsCallRequest(call, sourceSelectedDeclaration, options = {}) {
  const callee = options.calleeReceiver === undefined
    ? {}
    : propertyAccessCallee(options.calleeReceiver, sourceSelectedDeclaration?.Name?.Text ?? "");
  return {
    target: "csharp",
    call,
    callee,
    arguments: options.arguments ?? [],
    sourceSelectedDeclaration,
    sourceSelectedSignature: { declaration: sourceSelectedDeclaration },
  };
}

function propertyAccessCallee(receiver, memberName) {
  if (receiver.Kind === undefined) {
    receiver.Kind = "KindIdentifier";
  }
  const name = { Kind: "KindIdentifier", Text: memberName };
  const callee = {
    Kind: "KindPropertyAccessExpression",
    Expression: receiver,
    name,
  };
  name.Parent = callee;
  receiver.Parent = callee;
  return callee;
}

function fakeHost(targetTypes = new Map()) {
  return {
    getTargetTypeRefForSubject: (subject, context) =>
      targetTypes.get(subject) ??
      context?.factResolver?.resolve(subject, runtimeCarrierFactKey)?.carrier ??
      context?.factResolver?.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType,
    getCsharpObjectShapeFactForSubject: () => undefined,
    mapRuntimeCarrier: () => ({ kind: "defer" }),
  };
}

function fakeContext(facts) {
  return {
    facts,
    factResolver: {
      resolve: (subject, key) => facts.get(subject, key),
    },
    compiler: {
      ast: {
        getSourceFile: (node) => node?.SourceFile,
        getFileName: (sourceFile) => sourceFile?.FileName ?? "",
        parent: (node) => node?.Parent,
        name: (node) => node?.Name,
        text: (node) => node?.Text ?? "",
        kindName: (node) => node?.Kind ?? "Undefined",
        is: {
          IsPropertyAccessExpression: (node) => node?.Kind === "KindPropertyAccessExpression",
          IsIdentifier: (node) => node?.Kind === "KindIdentifier",
          IsPrivateIdentifier: () => false,
          IsQualifiedName: () => false,
          IsVariableDeclaration: () => false,
          IsParameterDeclaration: () => false,
          IsBindingElement: () => false,
          IsFunctionDeclaration: () => false,
          IsClassDeclaration: () => false,
          IsMethodDeclaration: () => false,
          IsPropertyDeclaration: () => false,
          IsTypeReferenceNode: () => false,
          IsKeywordTypeNode: () => false,
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
          IsTypeParameterDeclaration: () => false,
          IsTypeAliasDeclaration: () => false,
          IsInterfaceDeclaration: () => false,
          IsImportTypeNode: () => false,
          IsNewExpression: (node) => node?.Kind === "KindNewExpression",
          IsCallExpression: (node) => node?.Kind === "KindCallExpression",
        },
      },
      checker: {
        getSignatureDeclaration: (signature) => signature?.declaration,
        getSymbolAtLocation: () => undefined,
        getResolvedSymbol: () => undefined,
        getResolvedSymbolOrNil: () => undefined,
        getAliasedSymbol: () => undefined,
        getTypeAtLocation: () => undefined,
        getTypeSymbol: () => undefined,
        getSymbolDeclarations: () => [],
      },
    },
  };
}

function int32Type() {
  return { kind: "source-primitive", name: "int32" };
}

function float64Type() {
  return { kind: "source-primitive", name: "float64" };
}

function stringType() {
  return {
    kind: "target-named",
    id: "System.String",
    csharpRender: { kind: "predefined", name: "string" },
    csharpSpecialType: "string",
    csharpTypeofRuntimeKind: "string",
  };
}

function jsObjectType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.JSObject",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "JSObject" },
  };
}

function regexpType() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.RegExp",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "RegExp" },
    csharpJsSurfaceKind: "regexp",
  };
}

class TestFactStore {
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
