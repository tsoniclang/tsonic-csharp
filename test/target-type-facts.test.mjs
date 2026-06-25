import { test } from "node:test";
import assert from "node:assert/strict";
import { getCsharpTypeForNode } from "../dist/backend/planner/csharp-types.js";
import { planTypeParameters } from "../dist/backend/planner/type-parameters.js";
import { KindIdentifier, KindTypeReference } from "../dist/backend/planner/source-ast.js";
import { isCsharpThrowableCarrier } from "../dist/backend/planner/statement-output.js";
import { printCsharpType } from "../dist/print/csharp-printer.js";
import { csharpTargetTypeParameterConstraintFactKey } from "../dist/source/csharp-facts.js";
import {
  isCsharpStringType,
  isVoidTargetType,
  unwrapNullableTargetType,
} from "../dist/source/csharp-source-semantics/target-rules.js";
import { getTypeofRuntimeKind } from "../dist/source/csharp-source-semantics/typeof-operators.js";
import {
  csharpBigIntegerTargetType,
  csharpBooleanTargetType,
  csharpExceptionTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  getCsharpArrayLiteralElementTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import {
  csharpJsRegExpTargetType,
  isCsharpJsRegExpRuntimeCarrier,
} from "../dist/source/csharp-source-semantics/surfaces/js/regexp.js";
import {
  csharpJsDateTargetType,
  isCsharpJsDateRuntimeCarrier,
} from "../dist/source/csharp-source-semantics/surfaces/js/date.js";

test("throwable carriers require explicit C# target capability metadata", () => {
  assert.equal(isCsharpThrowableCarrier({ kind: "target-named", id: "System.Exception" }), false);
  assert.equal(isCsharpThrowableCarrier(csharpTargetNamedType("System.Exception")), false);
  assert.equal(isCsharpThrowableCarrier(csharpExceptionTargetType()), true);
});

test("typeof runtime mapping requires explicit C# target metadata", () => {
  assert.equal(getTypeofRuntimeKind({ kind: "target-named", id: "System.String" }, { allowNullableUnwrap: false }), undefined);
  assert.equal(getTypeofRuntimeKind(csharpTargetNamedType("System.String"), { allowNullableUnwrap: false }), undefined);
  assert.equal(getTypeofRuntimeKind(csharpStringTargetType(), { allowNullableUnwrap: false }), "string");
  assert.equal(getTypeofRuntimeKind(csharpBooleanTargetType(), { allowNullableUnwrap: false }), "boolean");
  assert.equal(getTypeofRuntimeKind(csharpBigIntegerTargetType(), { allowNullableUnwrap: false }), "bigint");
});

test("special C# target types require explicit metadata", () => {
  const rawString = { kind: "target-named", id: "System.String" };
  const rawVoid = { kind: "target-named", id: "System.Void" };
  const intType = { kind: "source-primitive", name: "int32" };
  const rawNullable = { kind: "target-named", id: "System.Nullable`1", typeArguments: [intType] };
  assert.equal(isCsharpStringType(rawString), false);
  assert.equal(isCsharpStringType(csharpTargetNamedType("System.String")), false);
  assert.equal(isCsharpStringType(csharpStringTargetType()), true);
  assert.equal(isVoidTargetType(rawVoid), false);
  assert.equal(isVoidTargetType(csharpTargetNamedType("System.Void")), false);
  assert.equal(isVoidTargetType(csharpVoidTargetType()), true);
  assert.equal(unwrapNullableTargetType(rawNullable), rawNullable);
  assert.deepEqual(unwrapNullableTargetType(csharpTargetNamedType("System.Nullable`1", [intType])), csharpTargetNamedType("System.Nullable`1", [intType]));
  assert.deepEqual(unwrapNullableTargetType(csharpNullableValueTargetType(intType)), intType);
});

test("collection literal acceptance requires explicit C# target metadata", () => {
  const intType = { kind: "source-primitive", name: "int32" };
  const rawEnumerable = {
    kind: "target-named",
    id: "System.Collections.Generic.IEnumerable`1",
    typeArguments: [intType],
  };
  const enrichedEnumerable = csharpTargetNamedType("System.Collections.Generic.IEnumerable`1", [intType], {
    kind: "named",
    namespace: ["System", "Collections", "Generic"],
    name: "IEnumerable",
  }, {
    arrayLiteralElementType: intType,
  });

  assert.equal(getCsharpArrayLiteralElementTargetType(rawEnumerable), undefined);
  assert.deepEqual(getCsharpArrayLiteralElementTargetType(enrichedEnumerable), intType);
});

test("JS RegExp runtime carrier requires explicit JS surface metadata", () => {
  assert.equal(isCsharpJsRegExpRuntimeCarrier({ kind: "target-named", id: "Tsonic.CSharp.Js.RegExp" }), false);
  assert.equal(isCsharpJsRegExpRuntimeCarrier(csharpJsRegExpTargetType()), true);
});

test("JS Date runtime carrier requires explicit JS surface metadata", () => {
  assert.equal(isCsharpJsDateRuntimeCarrier({ kind: "target-named", id: "Tsonic.CSharp.Js.Date" }), false);
  assert.equal(isCsharpJsDateRuntimeCarrier(csharpJsDateTargetType()), true);
});

test("type parameter constraints render finalized C# type facts", () => {
  const node = typeParameterNode("T");
  const diagnostics = [];
  const parameters = planTypeParameters([node], {}, fakeInput({
    subject: node,
    constraintFact: {
      constraints: [{
        kind: "csharp-type",
        type: csharpTargetNamedType("System.Numerics.INumber`1", [{ kind: "type-parameter", name: "T" }], csharpQualifiedTypeRenderShape("System.Numerics", "INumber")),
      }],
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(parameters.length, 1);
  assert.equal(parameters[0].name, "T");
  assert.deepEqual(parameters[0].constraints, [{
    kind: "TypeConstraint",
    type: {
      kind: "QualifiedName",
      left: {
        kind: "QualifiedName",
        left: { kind: "IdentifierName", name: "System" },
        name: "Numerics",
      },
      name: "INumber",
      typeArguments: [{ kind: "IdentifierName", name: "T" }],
    },
  }]);
});

test("type parameter constraints render finalized C# keyword facts", () => {
  const node = typeParameterNode("T");
  const diagnostics = [];
  const parameters = planTypeParameters([node], {}, fakeInput({
    subject: node,
    constraintFact: {
      constraints: [{
        kind: "csharp-keyword",
        keyword: "class",
      }],
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(parameters[0].constraints, [{
    kind: "KeywordConstraint",
    keyword: "class",
  }]);
});

test("type parameter constraints reject old target-specific mini protocols", () => {
  const node = typeParameterNode("T");
  const diagnostics = [];
  const parameters = planTypeParameters([node], {}, fakeInput({
    subject: node,
    constraintFact: {
      constraints: [{
        kind: "target-specific",
        target: "csharp",
        name: "generic-math-number",
      }],
    },
  }), diagnostics);

  assert.equal(parameters.length, 1);
  assert.equal(parameters[0].constraints, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /does not support target type-parameter constraint 'csharp:generic-math-number'/);
});

test("provider-owned generic target type references require finalized target argument facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const argumentNode = typeReferenceNode("int32");
  const reference = typeReferenceNode("List", [argumentNode]);
  const listBinding = {
    id: "System.Collections.Generic.List`1",
    target: "csharp",
    kind: "class",
    sourceName: "List",
    targetName: "System.Collections.Generic.List",
    csharpRender: csharpQualifiedTypeRenderShape("System.Collections.Generic", "List"),
    typeParameters: [{ name: "T" }],
  };
  const diagnostics = [];

  const rendered = getCsharpTypeForNode(reference, sourceFile, fakeTypeInput(sourceFile, {
    targetBindings: new Map([[reference, listBinding]]),
    runtimeCarriers: new Map([[argumentNode, csharpSourcePrimitiveTargetType("int32")]]),
  }), undefined, diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpType(rendered), "System.Collections.Generic.List<int>");

  const missingDiagnostics = [];
  const missing = getCsharpTypeForNode(reference, sourceFile, fakeTypeInput(sourceFile, {
    targetBindings: new Map([[reference, listBinding]]),
  }), undefined, missingDiagnostics);

  assert.equal(missing.kind, "InvalidType");
  assert.equal(missingDiagnostics.length, 1);
  assert.match(missingDiagnostics[0].message, /requires target type facts for every type argument/);
});

test("ptr and fnptr type references render only from finalized source-core type facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const intType = typeReferenceNode("int32");
  const boolType = typeReferenceNode("bool");
  const pointerType = typeReferenceNode("ptr", [intType]);
  const functionPointerType = typeReferenceNode("fnptr", [intType, boolType]);
  const diagnostics = [];
  const input = fakeTypeInput(sourceFile, {
    sourcePrimitives: new Map([
      [intType, sourcePrimitive("int32")],
      [boolType, sourcePrimitive("bool")],
    ]),
    pointerFacts: new Map([[pointerType, {
      pointee: intType,
      mutability: "target-defined",
      unsafeRequired: true,
    }]]),
    functionPointerFacts: new Map([[functionPointerType, {
      parameters: [intType],
      result: boolType,
      abi: ["target-default"],
      unsafeRequired: true,
    }]]),
  });

  assert.equal(printCsharpType(getCsharpTypeForNode(pointerType, sourceFile, input, undefined, diagnostics)), "int*");
  assert.equal(printCsharpType(getCsharpTypeForNode(functionPointerType, sourceFile, input, undefined, diagnostics)), "delegate*<int, bool>");
  assert.deepEqual(diagnostics, []);

  const missingDiagnostics = [];
  const missing = getCsharpTypeForNode(pointerType, sourceFile, fakeTypeInput(sourceFile, {
    pointerFacts: new Map([[pointerType, {
      pointee: intType,
      mutability: "target-defined",
      unsafeRequired: true,
    }]]),
  }), undefined, missingDiagnostics);

  assert.equal(missing.kind, "InvalidType");
  assert.equal(missingDiagnostics.length, 1);
  assert.match(missingDiagnostics[0].message, /requires a closed target type from TSTS\/provider facts/);
});

test("advanced erased type syntax emits only from finalized runtime carrier facts", () => {
  const sourceExample = `
    type Result<T> = T extends string ? Readonly<{ value: T }> : never;
  `;
  assert.match(sourceExample, /T extends string/);
  assert.match(sourceExample, /Readonly/);

  const sourceFile = sourceFileNode("/src/index.ts");
  const conditionalType = { Kind: "KindConditionalType" };
  const mappedType = { Kind: "KindMappedType" };
  const utilityType = typeReferenceNode("Readonly");
  const semanticOnlyType = typeReferenceNode("Partial");
  const tstsStringResult = { kind: "semantic-string-result" };
  const diagnostics = [];
  const input = fakeTypeInput(sourceFile, {
    semanticTypes: new Map([
      [conditionalType, tstsStringResult],
      [utilityType, tstsStringResult],
      [semanticOnlyType, tstsStringResult],
    ]),
    runtimeCarriers: new Map([
      [conditionalType, csharpStringTargetType()],
      [utilityType, csharpStringTargetType()],
    ]),
    stringSemanticTypes: new Set([tstsStringResult]),
  });

  assert.equal(printCsharpType(getCsharpTypeForNode(conditionalType, sourceFile, input, undefined, diagnostics)), "string");
  assert.equal(printCsharpType(getCsharpTypeForNode(utilityType, sourceFile, input, undefined, diagnostics)), "string");
  const semanticOnly = getCsharpTypeForNode(semanticOnlyType, sourceFile, input, undefined, diagnostics);
  const missing = getCsharpTypeForNode(mappedType, sourceFile, input, undefined, diagnostics);

  assert.equal(semanticOnly.kind, "InvalidType");
  assert.equal(missing.kind, "InvalidType");
  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0].message, /requires a closed target type from TSTS\/provider facts/);
  assert.match(diagnostics[1].message, /requires a closed target type from TSTS\/provider facts/);
});

test("backend type rendering rejects primitive semantic shapes without finalized carriers", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const value = { Kind: KindIdentifier, Text: "value" };
  const numberType = { kind: "semantic-number" };
  const diagnostics = [];
  const rendered = getCsharpTypeForNode(value, sourceFile, fakeTypeInput(sourceFile, {
    semanticTypes: new Map([[value, numberType]]),
    numberSemanticTypes: new Set([numberType]),
  }), undefined, diagnostics);

  assert.equal(rendered.kind, "InvalidType");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a closed target type from TSTS\/provider facts/);
});

function typeParameterNode(name) {
  return {
    Kind: "KindTypeParameter",
    name: { Kind: KindIdentifier, Text: name },
  };
}

function typeReferenceNode(name, typeArguments = []) {
  return {
    Kind: KindTypeReference,
    TypeName: { Kind: KindIdentifier, Text: name },
    Text: name,
    TypeArguments: { Nodes: typeArguments },
  };
}

function sourceFileNode(fileName) {
  return { Kind: "KindSourceFile", FileName: fileName, IsDeclarationFile: false, Statements: { Nodes: [] } };
}

function sourcePrimitive(kind) {
  return {
    kind,
    runtimeBase: kind === "bool" ? "boolean" : "number",
    signed: kind !== "bool",
    width: kind === "bool" ? undefined : 32,
  };
}

function fakeInput(options) {
  return {
    ast: {
      kindName: (node) => String(node?.Kind),
      kindNameFromKind: (kind) => String(kind),
    },
    facts: {
      getFact: (subject, key) =>
        subject === options.subject && key === csharpTargetTypeParameterConstraintFactKey
          ? options.constraintFact
          : undefined,
    },
  };
}

function fakeTypeInput(sourceFile, options = {}) {
  return {
    ast: {
      kindName: (node) => String(node?.Kind),
      kindNameFromKind: (kind) => String(kind),
      text: (node) => String(node?.Text ?? ""),
      name: (node) => node?.name ?? node?.TypeName,
      typeArguments: (node) => node?.TypeArguments?.Nodes ?? [],
      parent: () => undefined,
      getSourceFile: () => sourceFile,
      is: {
        IsKeywordTypeNode: () => false,
        IsTypeReferenceNode: (node) => node?.Kind === KindTypeReference,
        IsUnionTypeNode: () => false,
        IsIntersectionTypeNode: () => false,
        IsConditionalTypeNode: (node) => node?.Kind === "KindConditionalType",
        IsInferTypeNode: () => false,
        IsArrayTypeNode: () => false,
        IsIndexedAccessTypeNode: () => false,
        IsLiteralTypeNode: () => false,
        IsThisTypeNode: () => false,
        IsMappedTypeNode: (node) => node?.Kind === "KindMappedType",
        IsTupleTypeNode: () => false,
        IsOptionalTypeNode: () => false,
        IsRestTypeNode: () => false,
        IsParenthesizedTypeNode: () => false,
        IsFunctionTypeNode: () => false,
        IsConstructorTypeNode: () => false,
        IsTemplateLiteralTypeNode: () => false,
        IsImportTypeNode: () => false,
        IsClassDeclaration: () => false,
      },
    },
    sourceFiles: [sourceFile],
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getSelectedTargetCall: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: (subject) => {
        const carrier = options.runtimeCarriers?.get(subject);
        return carrier === undefined ? undefined : { carrier };
      },
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
    semantics: {
      getProjectSourceReferenceForNode: () => undefined,
      getTargetBindingForReference: (subject) => options.targetBindings?.get(subject),
      getProjectSourceDeclarationForNode: () => undefined,
      getTypeFromTypeNode: (subject) => options.semanticTypes?.get(subject),
      getTypeAtLocation: (subject) => options.semanticTypes?.get(subject),
      describeTypeAtLocation: () => "<unresolved>",
      getResolvedCallReturnRuntimeCarrier: () => undefined,
      getResolvedCallReturnType: () => undefined,
      getRuntimeCarrierForNode: (subject) => options.runtimeCarriers?.get(subject),
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getProjectSourceReferenceForSymbol: () => undefined,
    },
    types: {
      isAny: () => false,
      isUnknown: () => false,
      isNumberLike: (type) => options.numberSemanticTypes?.has(type) === true,
      isStringLike: (type) => options.stringSemanticTypes?.has(type) === true,
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
