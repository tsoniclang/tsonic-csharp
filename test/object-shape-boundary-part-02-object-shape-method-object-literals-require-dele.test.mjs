import { test, assert, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, csharpObjectShapeFactKey, csharpTargetOperationFactKey, beginObjectShapePlanning, beginObjectShapeSourceFilePlanning, csharpTypeFromObjectShapeFact, objectShapeStorageMemberName, takeObjectShapeDeclarations, planObjectLiteralExpressionWithExpectedType, planObjectShapeSpreadAssignments, tryPlanRecordDictionaryLiteralWithExpectedType, printCsharpCompilationUnit, planElementAccessExpression, planPropertyAccessExpression, KindElementAccessExpression, KindFalseKeyword, KindGetAccessor, KindIdentifier, KindMethodDeclaration, KindNumericLiteral, KindObjectLiteralExpression, KindPropertyAccessExpression, KindPropertyAssignment, KindShorthandPropertyAssignment, KindSpreadAssignment, KindStringLiteral, KindTrueKeyword, csharpQualifiedTypeRenderShape, csharpDelegateTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType, identifier, propertyAccess, elementAccess, numericLiteral, binaryExpression, objectLiteral, shorthandPropertyAssignment, spreadAssignment, propertyAssignment, getAccessor, methodDeclaration, parameter, block, stringLiteral, sourceFileNode, attachSourceFile, setParentRecursive, childNodes, span, trueKeyword, falseKeyword, planExpression, planExpectedExpression, fakeInput, targetOperation, csharpMemberOperation, recordDictionaryType, dictionaryTypeNode, fakeAst } from "./object-shape-boundary.helpers.mjs";

test("object-shape method object literals require delegate signature facts", () => {
  const method = methodDeclaration(identifier("run"), {
    parameters: [parameter(identifier("value"))],
    body: block([]),
  });
  const literal = objectLiteral([method]);
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "run",
      targetName: "Run",
      memberKind: "method",
      type: csharpTargetNamedType("Provider.CustomDelegate", undefined, { kind: "named", name: "CustomDelegate" }),
    }],
  };
  const diagnostics = [];

  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    fakeInput({ objectShapes: new Map([[literal, shape]]) }),
    diagnostics,
    { kind: "IdentifierName", name: "__Shape" },
    undefined,
    planExpression,
    planExpectedExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /must carry a finalized delegate target type/);
});
test("record dictionary object literals lower through explicit nested Record carriers", () => {
  const sourceFile = {};
  const nestedLiteral = objectLiteral([
    propertyAssignment(identifier("password"), trueKeyword()),
    propertyAssignment(identifier("dev"), trueKeyword()),
    propertyAssignment(stringLiteral("openid connect"), falseKeyword()),
  ]);
  const rootLiteral = objectLiteral([
    propertyAssignment(identifier("authentication_methods"), nestedLiteral),
  ]);
  const innerDictionary = recordDictionaryType(csharpStringTargetType(), { kind: "source-primitive", name: "bool" });
  const outerDictionary = recordDictionaryType(csharpStringTargetType(), innerDictionary);
  const diagnostics = [];

  const planned = tryPlanRecordDictionaryLiteralWithExpectedType(
    rootLiteral,
    sourceFile,
    fakeInput({ runtimeCarriers: new Map([[rootLiteral, outerDictionary]]) }),
    diagnostics,
    rootLiteral,
    planExpectedExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "ObjectCreationExpression",
    type: dictionaryTypeNode(
      { kind: "PredefinedType", name: "string" },
      dictionaryTypeNode({ kind: "PredefinedType", name: "string" }, { kind: "PredefinedType", name: "bool" }),
    ),
    collectionInitializers: [{
      kind: "IndexerInitializer",
      arguments: [{ kind: "LiteralExpression", value: "authentication_methods" }],
      expression: {
        kind: "ObjectCreationExpression",
        type: dictionaryTypeNode({ kind: "PredefinedType", name: "string" }, { kind: "PredefinedType", name: "bool" }),
        collectionInitializers: [
          {
            kind: "IndexerInitializer",
            arguments: [{ kind: "LiteralExpression", value: "password" }],
            expression: { kind: "LiteralExpression", value: true },
          },
          {
            kind: "IndexerInitializer",
            arguments: [{ kind: "LiteralExpression", value: "dev" }],
            expression: { kind: "LiteralExpression", value: true },
          },
          {
            kind: "IndexerInitializer",
            arguments: [{ kind: "LiteralExpression", value: "openid connect" }],
            expression: { kind: "LiteralExpression", value: false },
          },
        ],
      },
    }],
  });
});
test("object spread assignments emit only from finalized source and target object-shape facts", () => {
  const source = identifier("source");
  const spread = spreadAssignment(source);
  const countMember = {
    sourceName: "count",
    targetName: "Count",
    memberKind: "property",
    type: { kind: "source-primitive", name: "int32" },
  };
  const labelMember = {
    sourceName: "label",
    targetName: "Label",
    memberKind: "property",
    type: csharpStringTargetType(),
  };
  const sourceShape = {
    targetType: {
      kind: "target-named",
      id: "__SourceShape",
      csharpRender: { kind: "named", name: "__SourceShape" },
    },
    members: [countMember, labelMember],
  };
  const targetShape = {
    targetType: {
      kind: "target-named",
      id: "__TargetShape",
      csharpRender: { kind: "named", name: "__TargetShape" },
    },
    members: [
      { ...countMember, targetName: "TargetCount" },
      { ...labelMember, targetName: "TargetLabel" },
    ],
  };
  const diagnostics = [];

  const assignments = planObjectShapeSpreadAssignments(
    spread,
    targetShape,
    {},
    fakeInput({ objectShapes: new Map([[source, sourceShape]]) }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(assignments, [
    {
      kind: "AssignmentExpression",
      name: "TargetCount",
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "source" },
        name: "Count",
      },
    },
    {
      kind: "AssignmentExpression",
      name: "TargetLabel",
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "source" },
        name: "Label",
      },
    },
  ]);
});
test("object spread fails closed without finalized source object-shape facts", () => {
  const spread = spreadAssignment(identifier("source"));
  const sourceText = "const value = { ...source };\n";
  const sourceFile = sourceFileNode("/repo/src/object-spread.ts", sourceText);
  spread.Loc = span(sourceText, "...source");
  attachSourceFile(sourceFile, objectLiteral([spread]));
  const diagnostics = [];

  const assignments = planObjectShapeSpreadAssignments(
    spread,
    {
      targetType: {
        kind: "target-named",
        id: "__TargetShape",
        csharpRender: { kind: "named", name: "__TargetShape" },
      },
      members: [{
        sourceName: "count",
        targetName: "Count",
        memberKind: "property",
        type: { kind: "source-primitive", name: "int32" },
      }],
    },
    sourceFile,
    fakeInput(),
    diagnostics,
    planExpression,
  );

  assert.equal(assignments, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object literal spread requires finalized provider object-shape facts/);
  assert.ok(diagnostics[0].evidence?.includes("source.span=1:17-1:26"));
  assert.deepEqual(diagnostics[0].sourceSpan, {
    fileName: "/repo/src/object-spread.ts",
    line: 1,
    column: 17,
    endLine: 1,
    endColumn: 26,
  });
});
test("object spread rejects non-identifier expressions until single-evaluation facts exist", () => {
  const spread = spreadAssignment(objectLiteral([]));
  const sourceText = "const value = { ...{} };\n";
  const sourceFile = sourceFileNode("/repo/src/object-spread.ts", sourceText);
  spread.Loc = span(sourceText, "...{}");
  attachSourceFile(sourceFile, objectLiteral([spread]));
  const diagnostics = [];

  const assignments = planObjectShapeSpreadAssignments(
    spread,
    {
      targetType: {
        kind: "target-named",
        id: "__TargetShape",
        csharpRender: { kind: "named", name: "__TargetShape" },
      },
      members: [],
    },
    sourceFile,
    fakeInput(),
    diagnostics,
    planExpression,
  );

  assert.equal(assignments, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a single-evaluation provider lowering/);
  assert.ok(diagnostics[0].evidence?.includes("source.span=1:17-1:22"));
  assert.deepEqual(diagnostics[0].sourceSpan, {
    fileName: "/repo/src/object-spread.ts",
    line: 1,
    column: 17,
    endLine: 1,
    endColumn: 22,
  });
});
test("object literal spread missing facts fail closed before partial C# object creation", () => {
  const sourceExample = `
    type Shape = { count: number; label: string };
    declare const source: Shape;
    const value: Shape = { count: 1, ...source };
  `;
  assert.match(sourceExample, /\.\.\.source/);

  const source = identifier("source");
  const sourceText = "const value: Shape = { count: 1, ...source };\n";
  const sourceFile = sourceFileNode("/repo/src/object-spread.ts", sourceText);
  const literal = objectLiteral([
    propertyAssignment(identifier("count"), numericLiteral("1")),
    spreadAssignment(source),
  ]);
  literal.Properties.Nodes[1].Loc = span(sourceText, "...source");
  attachSourceFile(sourceFile, literal);
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [
      {
        sourceName: "count",
        targetName: "Count",
        memberKind: "property",
        type: { kind: "source-primitive", name: "int32" },
      },
      {
        sourceName: "label",
        targetName: "Label",
        memberKind: "property",
        type: csharpStringTargetType(),
      },
    ],
  };
  const diagnostics = [];

  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    sourceFile,
    fakeInput({ objectShapes: new Map([[literal, shape]]) }),
    diagnostics,
    { kind: "IdentifierName", name: "__Shape" },
    undefined,
    planExpression,
    planExpectedExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object literal spread requires finalized provider object-shape facts/);
  assert.ok(diagnostics[0].evidence?.includes("source.span=1:34-1:43"));
  assert.deepEqual(diagnostics[0].sourceSpan, {
    fileName: "/repo/src/object-spread.ts",
    line: 1,
    column: 34,
    endLine: 1,
    endColumn: 43,
  });
});