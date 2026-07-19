import { test } from "node:test";
import assert from "node:assert/strict";
import { planCsharpArtifacts } from "../dist/backend/planner/csharp-planner.js";
import { getRequiredCsharpTargetOperation } from "../dist/backend/planner/csharp-target-operations.js";
import { missingCarrierResolution } from "./helpers/target-facts.mjs";

test("missing required runtime carrier preserves resolver reason and evidence and emits no artifacts", () => {
  const sourceText = "const ready = true;\nif (ready) {}\n";
  const fileName = "/repo/src/index.ts";
  const sourceFile = sourceFileNode(fileName, sourceText);
  const condition = node("KindIdentifier", {
    Text: "ready",
    Loc: span(sourceText, "ready"),
  });
  const statement = node("KindIfStatement", {
    Expression: condition,
    ThenStatement: node("KindBlock", {
      Statements: { Nodes: [] },
      Loc: span(sourceText, "{}"),
    }),
    Loc: span(sourceText, "if (ready) {}"),
  });
  setParents(sourceFile, statement);

  const input = fakeCompileInput(sourceFile, {
    runtimeCarrierResolution: missingCarrierResolution(
      "resolver exhausted finalized node and semantic type carrier facts",
      [{
        message: "resolver evidence: identifier ready had no finalized runtimeCarrierFact",
        subject: condition,
      }],
    ),
  });

  const result = planCsharpArtifacts(input);

  assert.equal(result.artifacts.length, 0);
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0].message, /resolver exhausted finalized node and semantic type carrier facts/u);
  assert.ok(result.diagnostics[0].evidence?.includes("resolver evidence: identifier ready had no finalized runtimeCarrierFact"));
  assert.ok(result.diagnostics[0].evidence?.includes(`source.module=${fileName}`));
  assert.ok(result.diagnostics[0].evidence?.includes(`source.file=${fileName}`));
  assert.ok(result.diagnostics[0].evidence?.includes("source.span=2:5-2:10"));
  assert.deepEqual(result.diagnostics[0].sourceSpan, {
    fileName,
    line: 2,
    column: 5,
    endLine: 2,
    endColumn: 10,
  });
});

test("unsupported selected backend operation records source module, file, and span evidence", () => {
  const sourceText = "const value = \"\";\nvalue.trim();\n";
  const fileName = "/repo/src/index.ts";
  const sourceFile = sourceFileNode(fileName, sourceText);
  const operationNode = node("KindCallExpression", {
    Loc: span(sourceText, "value.trim()"),
  });
  setParents(sourceFile, operationNode);
  const diagnostics = [];

  const operation = getRequiredCsharpTargetOperation(fakeCompileInput(sourceFile), operationNode, {
    operationId: "test.selected.operation",
    operationKind: "method",
  }, diagnostics, "C# selected operation emission");

  assert.equal(operation, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /generic TSTS target operation 'test\.selected\.operation' is not enough/u);
  assert.ok(diagnostics[0].evidence?.includes(`source.module=${fileName}`));
  assert.ok(diagnostics[0].evidence?.includes(`source.file=${fileName}`));
  assert.ok(diagnostics[0].evidence?.includes("source.span=2:1-2:13"));
  assert.deepEqual(diagnostics[0].sourceSpan, {
    fileName,
    line: 2,
    column: 1,
    endLine: 2,
    endColumn: 13,
  });
});

function fakeCompileInput(sourceFile, options = {}) {
  return {
    ast: {
      kindName: (subject) => String(subject?.Kind ?? "Undefined"),
      kindNameFromKind: (kind) => String(kind),
      text: (subject) => String(subject?.Text ?? ""),
      name: (subject) => subject?.name,
      typeArguments: (subject) => subject?.TypeArguments?.Nodes ?? [],
      parent: (subject) => subject?.Parent,
      getSourceFile: () => sourceFile,
      forEachChild: forEachChildNode,
      is: {
        IsStringLiteral: () => false,
        IsNoSubstitutionTemplateLiteral: () => false,
        IsTemplateExpression: () => false,
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
        IsClassDeclaration: () => false,
      },
    },
    sourceFiles: [sourceFile],
    facts: {
      getFact: () => undefined,
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getTargetBindingFact: () => undefined,
      getRuntimeCarrierFact: () => undefined,
      getObjectShapeFact: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getAttributeFact: () => undefined,
      getSourcePrimitiveFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getFieldFact: () => undefined,
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getSourceMarkerFact: () => undefined,
    },
    analysis: {
      getProjectSourceModuleDependencies: () => [],
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getTypeOfSymbol: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      getEnumMemberConstant: () => undefined,
      isProjectSourceShapeForNode: () => false,
      isProjectSourceConstructibleObjectForNode: () => false,
      getProjectSourceDeclarationForNode: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getProjectSourceMemberDispatch: () => undefined,
      describeTypeAtLocation: () => undefined,
      lazy: {},
    },
    targetFacts: {
      resolveRuntimeCarrier: () => options.runtimeCarrierResolution ?? missingCarrierResolution(),
      resolveRuntimeCarrierForNode: () => options.runtimeCarrierResolution ?? missingCarrierResolution(),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
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
    project: { entryPoint: "src/index.ts", targets: [] },
    target: { id: "csharp", options: {} },
    runtimeReferences: [],
    paths: {
      projectFilePath: "/repo/tsonic.json",
      projectRoot: "/repo",
      outputRoot: "/repo/out",
      targetOutputRoot: "/repo/out/csharp",
    },
  };
}

function sourceFileNode(fileName, text) {
  return node("KindSourceFile", {
    IsDeclarationFile: false,
    Statements: { Nodes: [] },
    FileName: () => fileName,
    Text: () => text,
    Loc: { pos: 0, end: text.length },
  });
}

function node(kind, properties = {}) {
  return {
    Kind: kind,
    ...properties,
  };
}

function setParents(sourceFile, ...statements) {
  sourceFile.Statements = { Nodes: statements };
  for (const statement of statements) {
    setParentRecursive(statement, sourceFile);
  }
}

function setParentRecursive(subject, parent) {
  if (subject === undefined || subject === null || typeof subject !== "object") {
    return;
  }
  subject.Parent = parent;
  forEachChildNode(subject, (child) => setParentRecursive(child, subject));
}

function forEachChildNode(subject, visit) {
  for (const child of childrenOf(subject)) {
    visit(child);
  }
}

function childrenOf(subject) {
  return [
    ...nodeList(subject.Statements),
    ...nodeList(subject.Declarations),
    subject.Expression,
    subject.ThenStatement,
    subject.ElseStatement,
    subject.Statement,
    subject.DeclarationList,
    subject.Initializer,
    subject.name,
    subject.Type,
  ].filter((child) => child !== undefined);
}

function nodeList(list) {
  return list?.Nodes?.filter((child) => child !== undefined) ?? [];
}

function span(text, token) {
  const pos = text.lastIndexOf(token);
  assert.notEqual(pos, -1, `missing token '${token}'`);
  return { pos, end: pos + token.length };
}
