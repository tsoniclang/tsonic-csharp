import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
} from "./helpers/target-facts.mjs";
import { planCsharpArtifacts } from "../dist/backend/planner/csharp-planner.js";
import { planCsharpEntrypointSourceFile } from "../dist/backend/planner/csharp-entrypoint-planner.js";
import { planSourceFile } from "../dist/backend/planner/csharp-source-file-planner.js";
import { planCsharpModuleInitialization } from "../dist/backend/planner/csharp-module-initialization.js";
import { validateSourceFileOutputIdentities } from "../dist/backend/planner/source-paths.js";
import {
  KindExpressionStatement,
  KindStringLiteral,
} from "../dist/backend/planner/source-ast.js";

test("executable output plans a Roslyn AST entrypoint that invokes module initializers", () => {
  const input = fakeInput({
    outputType: "Exe",
  });
  const diagnostics = [];
  validateSourceFileOutputIdentities(input, diagnostics);
  const moduleInitialization = planCsharpModuleInitialization(input, diagnostics);
  const plannedSource = planSourceFile(input.sourceFiles[0], input, diagnostics, moduleInitialization);

  assert.deepEqual(diagnostics, []);
  assert.ok(plannedSource);
  assert.equal(plannedSource.hasModuleInitializer, true);

  const entrypoint = planCsharpEntrypointSourceFile(input, [plannedSource], moduleInitialization);

  assert.ok(entrypoint);
  assert.equal(entrypoint.path, "generated/TsonicEntrypoint.cs");
  const namespace = entrypoint.unit.members[0];
  assert.equal(namespace.kind, "NamespaceDeclaration");
  const entrypointClass = namespace.members[0];
  assert.equal(entrypointClass.kind, "ClassDeclaration");
  assert.equal(entrypointClass.name, "TsonicEntrypoint");
  const mainMethod = entrypointClass.members[0];
  assert.equal(mainMethod.kind, "MethodDeclaration");
  assert.equal(mainMethod.name, "Main");
  assert.deepEqual(mainMethod.modifiers, ["public", "static"]);
  assert.equal(mainMethod.returnType.name, "void");
  assert.deepEqual(mainMethod.body.statements, [{
    kind: "ExpressionStatement",
    expression: {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "Index" },
        name: "__tsonic_module_init",
      },
      arguments: [],
    },
  }]);
});

test("executable output still materializes source artifacts from the planned Roslyn AST", () => {
  const result = planCsharpArtifacts(fakeInput({
    outputType: "Exe",
  }));

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.artifacts.some((artifact) => artifact.path === "generated/TsonicEntrypoint.cs"), true);
  assert.equal(result.artifacts.some((artifact) => artifact.path === "src/Index.cs"), true);
});

test("library output does not synthesize executable entrypoint AST or artifacts", () => {
  const input = fakeInput();
  const diagnostics = [];
  validateSourceFileOutputIdentities(input, diagnostics);
  const moduleInitialization = planCsharpModuleInitialization(input, diagnostics);
  const plannedSource = planSourceFile(input.sourceFiles[0], input, diagnostics, moduleInitialization);
  assert.deepEqual(diagnostics, []);
  assert.ok(plannedSource);
  assert.equal(planCsharpEntrypointSourceFile(input, [plannedSource], moduleInitialization), undefined);

  const result = planCsharpArtifacts(input);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.artifacts.some((artifact) => artifact.path === "generated/TsonicEntrypoint.cs"), false);
  assert.equal(result.artifacts.some((artifact) => artifact.kind === "source"), true);
});

test("runtime module dependency cycles diagnose before C# module initialization planning", () => {
  const a = sourceFile("/project/a.ts");
  const b = sourceFile("/project/b.ts");
  const diagnostics = [];
  const input = fakeInput({
    outputType: "Exe",
    entryPoint: "a.ts",
    sourceFiles: [a, b],
    moduleDependencies: new Map([
      [a.FileName, [b]],
      [b.FileName, [a]],
    ]),
  });

  planCsharpModuleInitialization(input, diagnostics);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_UNSUPPORTED_RUNTIME_MODULE_CYCLE");
  assert.match(diagnostics[0].message, /a\.ts -> b\.ts -> a\.ts|b\.ts -> a\.ts -> b\.ts/u);
  assert.deepEqual(diagnostics[0].evidence, [
    "TSTS selected a runtime project-source import/export dependency cycle.",
    "C# emission must fail closed rather than reading uninitialized default target values.",
    "Implement provider-backed ESM live bindings/TDZ facts before enabling cyclic runtime module graphs.",
  ]);
});

function fakeInput(options = {}) {
  const sourceFiles = options.sourceFiles ?? [sourceFile()];
  const target = { id: "csharp", options };
  return {
    project: { entryPoint: options.entryPoint ?? "index.ts", targets: [target] },
    target,
    runtimeReferences: [],
    sourceFiles,
    paths: { projectRoot: "/project" },
    ast: fakeAst,
    facts: fakeFacts,
    analysis: fakeSemantics(options.moduleDependencies),
    targetFacts: fakeTargetFacts,
    types: fakeTypes,
  };
}

function sourceFile(fileName = "/project/index.ts") {
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

function fakeSemantics(moduleDependencies = new Map()) {
  return {
    getProjectSourceReferenceForNode: () => undefined,
    getProjectSourceDeclarationForNode: () => undefined,
    getProjectSourceModuleDependencies: (sourceFile) =>
      (moduleDependencies.get(sourceFile.FileName) ?? []).map((dependency) => ({
        sourceFile: dependency,
        declaration: {},
        moduleSpecifier: {},
        kind: "import",
      })),
    getObjectShapeForNode: () => undefined,
    getResolvedSymbol: () => undefined,
    getSymbolAtLocation: () => undefined,
    getTypeAtLocation: () => undefined,
    getTypeFromTypeNode: () => undefined,
    describeTypeAtLocation: () => undefined,
    getEnumMemberConstant: () => undefined,
  };
}

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
