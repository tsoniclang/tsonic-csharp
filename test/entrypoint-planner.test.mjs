import { test } from "node:test";
import assert from "node:assert/strict";
import { planCsharpArtifacts } from "../dist/backend/planner/csharp-planner.js";
import {
  KindExpressionStatement,
  KindStringLiteral,
} from "../dist/backend/planner/source-ast.js";

test("executable output emits a separate entrypoint that invokes module initializers", () => {
  const result = planCsharpArtifacts(fakeInput({
    outputType: "Exe",
  }));

  assert.deepEqual(result.diagnostics, []);
  const entrypoint = result.artifacts.find((artifact) => artifact.path === "generated/TsonicEntrypoint.cs");
  const moduleSource = result.artifacts.find((artifact) => artifact.path === "src/Index.cs");

  assert.ok(entrypoint);
  assert.ok(moduleSource);
  assert.match(moduleSource.text, /public static void __tsonic_module_init\(\)/);
  assert.match(moduleSource.text, /_ = "boot";/);
  assert.match(entrypoint.text, /public static void Main\(\)/);
  assert.match(entrypoint.text, /Index\.__tsonic_module_init\(\);/);
});

test("library output does not synthesize executable entrypoint artifacts", () => {
  const result = planCsharpArtifacts(fakeInput());

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.artifacts.some((artifact) => artifact.path === "generated/TsonicEntrypoint.cs"), false);
  assert.equal(result.artifacts.some((artifact) => artifact.kind === "source"), true);
});

function fakeInput(options = {}) {
  return {
    target: { id: "csharp", options },
    runtimeReferences: [],
    sourceFiles: [sourceFile()],
    paths: { projectRoot: "/project" },
    ast: fakeAst,
    facts: fakeFacts,
    semantics: fakeSemantics,
    types: fakeTypes,
  };
}

function sourceFile() {
  return {
    FileName: "/project/index.ts",
    IsDeclarationFile: false,
    Statements: {
      Nodes: [{
        Kind: KindExpressionStatement,
        Expression: {
          Kind: KindStringLiteral,
          Text: "boot",
        },
      }],
    },
  };
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  getSourceFile: () => undefined,
  forEachChild: () => undefined,
  typeArguments: () => [],
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

const fakeFacts = {
  getDefaultValueFact: () => undefined,
  getArgumentPassingFact: () => undefined,
  getTargetConversionFact: () => undefined,
  getSelectedTargetProperty: () => undefined,
  getSelectedTargetElementAccess: () => undefined,
  getSelectedTargetCall: () => undefined,
  getSelectedTargetOperator: () => undefined,
  getContextualTargetTypeFact: () => undefined,
  getRuntimeCarrierFact: () => undefined,
  getObjectShapeFact: () => undefined,
  getTargetBindingFact: () => undefined,
  getSourcePrimitiveFact: () => undefined,
  getTargetIterationFact: () => undefined,
  getValueTypeFact: () => undefined,
  getFieldFact: () => undefined,
  getSourceMarkerFact: () => undefined,
  getPointerFact: () => undefined,
  getFunctionPointerFact: () => undefined,
  getStructFact: () => undefined,
  getAttributeFact: () => undefined,
  getFact: () => undefined,
};

const fakeSemantics = {
  getTargetBindingForReference: () => undefined,
  getProjectSourceReferenceForNode: () => undefined,
  getProjectSourceDeclarationForNode: () => undefined,
  getRuntimeCarrierForNode: () => undefined,
  getObjectShapeForNode: () => undefined,
  getResolvedSymbol: () => undefined,
  getSymbolAtLocation: () => undefined,
  getTypeAtLocation: () => undefined,
  getTypeFromTypeNode: () => undefined,
  describeTypeAtLocation: () => undefined,
  getEnumMemberConstant: () => undefined,
  getReturnTypeCarrierFromDeclaration: () => undefined,
};

const fakeTypes = {
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
};
