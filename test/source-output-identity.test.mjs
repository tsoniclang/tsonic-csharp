import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
} from "./helpers/target-facts.mjs";
import { planCsharpArtifacts } from "../dist/backend/planner/csharp-planner.js";
import { sourceFileClassName } from "../dist/backend/planner/source-paths.js";
import {
  KindExpressionStatement,
  KindStringLiteral,
} from "../dist/backend/planner/source-ast.js";

test("source output identity emits deterministic artifacts for multiple project files", () => {
  const result = planCsharpArtifacts(fakeInput({
    sourceFiles: [
      sourceFile("/project/index.ts"),
      sourceFile("/project/nested/util.ts"),
    ],
  }));

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(sourceArtifactPaths(result), [
    "src/Index.cs",
    "src/nested/Nested_util.cs",
  ]);
  assert.match(sourceArtifact(result, "src/Index.cs").text, /public static class Index/);
  assert.match(sourceArtifact(result, "src/nested/Nested_util.cs").text, /public static class Nested_util/);
});

test("source output identity rejects files outside the project root", () => {
  const result = planCsharpArtifacts(fakeInput({
    sourceFiles: [sourceFile("/external/index.ts")],
  }));

  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "CSHARP_SOURCE_OUTSIDE_PROJECT_ROOT",
  ]);
  assert.match(result.diagnostics[0].message, /outside project root '\/project'/);
  assert.deepEqual(result.artifacts, []);
});

test("source output identity rejects deterministic class and artifact collisions", () => {
  const result = planCsharpArtifacts(fakeInput({
    sourceFiles: [
      sourceFile("/project/foo-bar.ts"),
      sourceFile("/project/foo@bar.ts"),
    ],
  }));

  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "CSHARP_SOURCE_IDENTITY_COLLISION",
    "CSHARP_SOURCE_ARTIFACT_COLLISION",
  ]);
  assert.match(result.diagnostics[0].message, /class identity 'FooBar'/);
  assert.match(result.diagnostics[1].message, /artifact path 'src\/FooBar.cs'/);
  assert.deepEqual(result.artifacts, []);
});

test("source output identity fails closed without a validated registry", () => {
  const input = fakeInput();

  assert.throws(
    () => sourceFileClassName(input, "/project/index.ts"),
    /Missing C# output identity registry/,
  );
});

function fakeInput(options = {}) {
  const target = { id: "csharp", options: options.targetOptions ?? {} };
  return {
    project: { entryPoint: "index.ts", targets: [target] },
    target,
    runtimeReferences: [],
    sourceFiles: options.sourceFiles ?? [sourceFile("/project/index.ts")],
    paths: { projectRoot: "/project" },
    ast: fakeAst,
    facts: fakeFacts,
    analysis: fakeSemantics,
    targetFacts: fakeTargetFacts,
    types: fakeTypes,
  };
}

function sourceFile(fileName) {
  return {
    FileName: fileName,
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

function sourceArtifactPaths(result) {
  return result.artifacts
    .filter((artifact) => artifact.kind === "source")
    .map((artifact) => artifact.path);
}

function sourceArtifact(result, path) {
  const artifact = result.artifacts.find((candidate) => candidate.kind === "source" && candidate.path === path);
  assert.ok(artifact, `Missing source artifact ${path}`);
  return artifact;
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  getFileName: (sourceFile) => sourceFile?.FileName ?? "",
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
  getProjectSourceReferenceForNode: () => undefined,
  getProjectSourceDeclarationForNode: () => undefined,
  getProjectSourceModuleDependencies: () => [],
  getObjectShapeForNode: () => undefined,
  getResolvedSymbol: () => undefined,
  getSymbolAtLocation: () => undefined,
  getTypeAtLocation: () => undefined,
  getTypeFromTypeNode: () => undefined,
  describeTypeAtLocation: () => undefined,
  getEnumMemberConstant: () => undefined,
};

const fakeTargetFacts = {
  getTargetBinding: () => undefined,
  getTargetBindingForReference: () => undefined,
  resolveRuntimeCarrier: () => missingCarrierResolution(),
  resolveRuntimeCarrierForNode: () => missingCarrierResolution(),
  resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
  resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
  resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
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
