import { test, assert, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, createDestructuringPlannerState, planStatements, planLocalDeclaration, printCsharpType, KindBlock, KindBreakStatement, KindContinueStatement, KindDefaultClause, KindDoStatement, KindArrayLiteralExpression, KindAwaitExpression, KindBinaryExpression, KindEqualsToken, KindExpressionStatement, KindForStatement, KindForInStatement, KindForOfStatement, KindIdentifier, KindLabeledStatement, KindNumericLiteral, KindObjectBindingPattern, KindObjectLiteralExpression, KindSpreadElement, KindStringLiteral, KindSwitchStatement, KindTryStatement, KindTrueKeyword, KindVariableDeclaration, KindVariableDeclarationList, KindWhileStatement, csharpObjectShapeFactKey, csharpTargetOperationFactKey, csharpTargetIterationFactKey, csharpExceptionTargetType, csharpListTargetType, csharpNullableValueTargetType, csharpQualifiedTypeRenderShape, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType, csharpTaskTargetType, csharpVoidTargetType, csharpTsValueTargetType, csharpJsArrayCarrierTargetType, switchStatement, caseClause, defaultClause, labeledStatement, whileStatement, doStatement, forStatement, forOfStatement, forInStatement, tryStatement, expressionStatement, awaitExpression, binaryExpression, catchClause, variableDeclarationList, variableDeclaration, block, breakStatement, continueStatement, identifier, numeric, stringLiteral, trueKeyword, throwStatement, typeNode, fakeInput, runtimeCarrierResolution, sourceFile, providerReadOnlyIndexableTargetType, fakeAst, stringCodePointIterationFact, charSurrogateOperation, objectShapeFact, recordDictionaryType, dictionaryKeysOperation } from "./statement-planner.helpers.mjs";

test("switch statements emit grouped Roslyn sections and deterministic fallthrough", () => {
  const diagnostics = [];
  const statement = switchStatement(numeric("1"), [
    caseClause(numeric("1"), []),
    defaultClause([]),
  ]);

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [{
    kind: "SwitchStatement",
    expression: { kind: "LiteralExpression", value: 1 },
    sections: [
      {
        kind: "SwitchSection",
        label: {
          kind: "CaseSwitchLabel",
          expression: { kind: "LiteralExpression", value: 1 },
        },
        statements: [{
          kind: "GotoSwitchStatement",
          label: { kind: "DefaultSwitchLabel" },
        }],
      },
      {
        kind: "SwitchSection",
        label: { kind: "DefaultSwitchLabel" },
        statements: [{ kind: "BreakStatement" }],
      },
    ],
  }]);
});
test("inferred local declarations use finalized initializer carrier resolution", () => {
  const diagnostics = [];
  const initializer = identifier("composeResult");
  const declaration = {
    Kind: KindVariableDeclaration,
    name: identifier("values"),
    Initializer: initializer,
  };
  const listCarrier = csharpListTargetType(csharpSourcePrimitiveTargetType("int32"));

  const output = planLocalDeclaration(declaration, sourceFile, fakeInput({
    resolvedRuntimeCarrierFacts: new Map([
      [initializer, { carrier: listCarrier }],
    ]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.equal(output.name, "values");
  assert.equal(printCsharpType(output.type), "System.Collections.Generic.List<int>");
});
test("switch statements diagnose non-constant labels instead of inventing C# lowering", () => {
  const diagnostics = [];
  const statement = switchStatement(identifier("value"), [
    caseClause(identifier("dynamicCase"), [breakStatement()]),
  ]);

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics);

  assert.equal(output[0].kind, "SwitchStatement");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Switch case labels must be C# compile-time constants/);
});
test("switch statements fail closed when the governing expression is missing", () => {
  const diagnostics = [];
  const statement = switchStatement(undefined, [
    defaultClause([]),
  ]);

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics);

  assert.deepEqual(output, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Switch statement requires a governing expression/);
});
test("switch statements keep explicit section terminators instead of adding fallthrough", () => {
  const diagnostics = [];
  const statement = switchStatement(numeric("1"), [
    caseClause(numeric("1"), [breakStatement()]),
    defaultClause([]),
  ]);

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output[0].sections[0].statements, [{ kind: "BreakStatement" }]);
  assert.deepEqual(output[0].sections[1].statements, [{ kind: "BreakStatement" }]);
});
test("labeled loops emit target control-flow labels without source-name target guessing", () => {
  const diagnostics = [];
  const statement = labeledStatement(
    "outer",
    whileStatement(trueKeyword(), block([
      continueStatement(identifier("outer")),
      breakStatement(identifier("outer")),
    ])),
  );

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.equal(output.length, 1);
  const wrapper = output[0];
  assert.equal(wrapper.kind, "Block");
  const labeled = wrapper.body.statements[0];
  assert.equal(labeled.kind, "LabeledStatement");
  assert.equal(labeled.name, "outer");
  assert.equal(labeled.statement.kind, "WhileStatement");
  assert.equal(labeled.statement.body.statements[0].kind, "GotoStatement");
  assert.match(labeled.statement.body.statements[0].label, /^__tsonic_label_outer_continue/u);
  assert.equal(labeled.statement.body.statements[1].kind, "GotoStatement");
  assert.match(labeled.statement.body.statements[1].label, /^__tsonic_label_outer_break/u);
  const breakTarget = wrapper.body.statements[1];
  assert.equal(breakTarget.kind, "LabeledStatement");
  assert.equal(breakTarget.name, labeled.statement.body.statements[1].label);
});
test("labeled control transfers fail closed when the target is missing or non-iterable", () => {
  const missingDiagnostics = [];
  const missingOutput = planStatements(
    breakStatement(identifier("missing")),
    sourceFile,
    fakeInput(),
    missingDiagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(missingOutput, []);
  assert.equal(missingDiagnostics.length, 1);
  assert.match(missingDiagnostics[0].message, /Labeled break target was not available/);

  const nonLoopDiagnostics = [];
  const nonLoopStatement = labeledStatement(
    "target",
    block([continueStatement(identifier("target"))]),
  );

  const nonLoopOutput = planStatements(
    nonLoopStatement,
    sourceFile,
    fakeInput(),
    nonLoopDiagnostics,
    createDestructuringPlannerState(),
  );

  assert.equal(nonLoopOutput[0].kind, "Block");
  assert.equal(nonLoopDiagnostics.length, 1);
  assert.match(nonLoopDiagnostics[0].message, /Labeled continue target must be an iteration statement/);
});
test("conditions fail closed without finalized bool carrier facts", () => {
  const diagnostics = [];
  const statement = whileStatement(identifier("flag"), block([]));

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics);

  assert.deepEqual(output, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /condition requires a finalized C# bool runtime carrier/);
});
test("condition carrier diagnostics preserve resolver reason and evidence", () => {
  const diagnostics = [];
  const statement = whileStatement(identifier("flag"), block([]));

  planStatements(statement, sourceFile, fakeInput({
    missingRuntimeCarrierReason: "test resolver could not prove Flag maps to System.Boolean",
    missingRuntimeCarrierEvidence: [{ message: "checked alias Flag -> bool lacked source-core carrier fact" }],
  }), diagnostics);

  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /test resolver could not prove Flag maps to System\.Boolean/);
  assert.deepEqual(diagnostics[0].evidence, ["checked alias Flag -> bool lacked source-core carrier fact"]);
});
test("for, while, and do loops emit Roslyn AST from finalized bool condition facts", () => {
  const diagnostics = [];
  const whileFlag = identifier("whileFlag");
  const doFlag = identifier("doFlag");
  const forFlag = identifier("forFlag");
  const statement = block([
    whileStatement(whileFlag, block([])),
    doStatement(doFlag, block([breakStatement()])),
    forStatement(undefined, forFlag, undefined, block([
      continueStatement(),
      breakStatement(),
    ])),
  ]);

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [whileFlag, { carrier: csharpSourcePrimitiveTargetType("bool") }],
      [doFlag, { carrier: csharpSourcePrimitiveTargetType("bool") }],
      [forFlag, { carrier: csharpSourcePrimitiveTargetType("bool") }],
    ]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [{
    kind: "Block",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "WhileStatement",
          condition: { kind: "IdentifierName", name: "whileFlag" },
          body: { kind: "Block", statements: [] },
        },
        {
          kind: "DoStatement",
          body: { kind: "Block", statements: [{ kind: "BreakStatement" }] },
          condition: { kind: "IdentifierName", name: "doFlag" },
        },
        {
          kind: "ForStatement",
          condition: { kind: "IdentifierName", name: "forFlag" },
          body: {
            kind: "Block",
            statements: [
              { kind: "ContinueStatement" },
              { kind: "BreakStatement" },
            ],
          },
        },
      ],
    },
  }]);
});
test("for conditions fail closed without finalized bool carrier facts", () => {
  const diagnostics = [];
  const statement = forStatement(undefined, identifier("flag"), undefined, block([]));

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics);

  assert.deepEqual(output, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /For statement condition requires a finalized C# bool runtime carrier/);
});
test("for-of emits a Roslyn foreach only from finalized provider iteration facts", () => {
  const diagnostics = [];
  const itemType = typeNode("Item");
  const item = variableDeclaration("item", itemType);
  const statement = forOfStatement(variableDeclarationList([item]), identifier("items"), block([]));

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [itemType, { carrier: csharpSourcePrimitiveTargetType("int32") }],
    ]),
    iterationFacts: new Map([
      [statement, {
        operationId: "test.forOf",
        iterationKind: "sync",
        lowering: { kind: "foreach" },
        elementType: csharpSourcePrimitiveTargetType("int32"),
      }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [{
    kind: "ForEachStatement",
    itemType: { kind: "PredefinedType", name: "int" },
    itemName: "item",
    collection: { kind: "IdentifierName", name: "items" },
    body: { kind: "Block", statements: [] },
  }]);
});
test("for-of fails closed when TSTS/provider iteration facts are absent", () => {
  const diagnostics = [];
  const statement = forOfStatement(
    variableDeclarationList([variableDeclaration("item", typeNode("Item"))]),
    identifier("items"),
    block([]),
  );

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics);

  assert.deepEqual(output, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /for-of emission requires finalized TSTS\/provider iteration facts/);
});
test("for-of rejects provider facts with the wrong iteration kind or lowering", () => {
  const diagnostics = [];
  const itemType = typeNode("Item");
  const item = variableDeclaration("item", itemType);
  const statement = forOfStatement(variableDeclarationList([item]), identifier("items"), block([]));

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [itemType, { carrier: csharpStringTargetType() }],
    ]),
    iterationFacts: new Map([
      [statement, {
        operationId: "test.wrongForOf",
        iterationKind: "property-key",
        lowering: { kind: "index-key", lengthMember: "Length", keyConversion: "invariant-string" },
        elementType: csharpStringTargetType(),
      }],
    ]),
  }), diagnostics);

  assert.deepEqual(output, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /for-of emission does not support provider iteration lowering 'index-key' with kind 'property-key'/);
});
test("for-of emits JS string code-point loops from finalized surface facts", () => {
  const diagnostics = [];
  const itemName = identifier("character");
  const text = identifier("text");
  const statement = forOfStatement(
    variableDeclarationList([{ Kind: KindVariableDeclaration, name: itemName }]),
    text,
    block([]),
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [itemName, { carrier: csharpStringTargetType() }],
    ]),
    iterationFacts: new Map([
      [statement, stringCodePointIterationFact()],
    ]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.equal(output[0].kind, "Block");
  const statements = output[0].body.statements;
  assert.deepEqual(statements[0], {
    kind: "LocalDeclarationStatement",
    name: "__tsonic_forOfString0",
    type: { kind: "PredefinedType", name: "string" },
    initializer: { kind: "IdentifierName", name: "text" },
  });
  assert.equal(statements[1].kind, "ForStatement");
  assert.deepEqual(statements[1].condition.right, {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "__tsonic_forOfString0" },
    name: "Length",
  });
  assert.deepEqual(statements[1].body.statements[0], {
    kind: "LocalDeclarationStatement",
    name: "character",
    type: { kind: "PredefinedType", name: "string" },
  });
  assert.equal(statements[1].body.statements[1].kind, "IfStatement");
});
test("for-in fails closed when finalized iteration facts are absent", () => {
  const diagnostics = [];
  const keyName = identifier("key");
  const statement = forInStatement(
    variableDeclarationList([{ Kind: KindVariableDeclaration, name: keyName }]),
    identifier("items"),
    block([]),
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [keyName, { carrier: csharpStringTargetType() }],
    ]),
  }), diagnostics);

  assert.deepEqual(output, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /for-in emission requires finalized TSTS\/provider iteration facts before C# emission/);
});
test("for-in rejects provider facts with the wrong iteration kind or lowering", () => {
  const diagnostics = [];
  const keyName = identifier("key");
  const statement = forInStatement(
    variableDeclarationList([{ Kind: KindVariableDeclaration, name: keyName }]),
    identifier("items"),
    block([]),
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [keyName, { carrier: csharpStringTargetType() }],
    ]),
    iterationFacts: new Map([
      [statement, {
        operationId: "test.wrongForIn",
        iterationKind: "sync",
        lowering: { kind: "foreach" },
        elementType: csharpStringTargetType(),
      }],
    ]),
  }), diagnostics);

  assert.deepEqual(output, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /for-in emission does not support provider iteration lowering 'foreach' with kind 'sync'/);
});
test("for-in rejects index-key facts whose key type is not finalized as string", () => {
  const diagnostics = [];
  const keyName = identifier("key");
  const items = identifier("items");
  const statement = forInStatement(
    variableDeclarationList([{ Kind: KindVariableDeclaration, name: keyName }]),
    items,
    block([]),
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [keyName, { carrier: csharpSourcePrimitiveTargetType("int32") }],
      [items, { carrier: { kind: "array", element: csharpSourcePrimitiveTargetType("int32") } }],
    ]),
    iterationFacts: new Map([
      [statement, {
        operationId: "test.indexKeys",
        iterationKind: "property-key",
        lowering: { kind: "index-key", lengthMember: "Length", keyConversion: "invariant-string" },
        elementType: csharpSourcePrimitiveTargetType("int32"),
      }],
    ]),
  }), diagnostics);

  assert.deepEqual(output, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /index-key lowering requires finalized provider key type string/);
});
test("for-in emits object-shape key loops from finalized JS surface facts", () => {
  const diagnostics = [];
  const keyName = identifier("key");
  const shape = identifier("shape");
  const statement = forInStatement(
    variableDeclarationList([{ Kind: KindVariableDeclaration, name: keyName }]),
    shape,
    block([]),
  );
  const objectShape = objectShapeFact("ShapeCarrier", [
    { sourceName: "alpha", targetName: "Alpha", memberKind: "property", type: csharpSourcePrimitiveTargetType("int32") },
    { sourceName: "beta", targetName: "Beta", memberKind: "property", type: csharpStringTargetType() },
  ]);

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [keyName, { carrier: csharpStringTargetType() }],
    ]),
    objectShapeFacts: new Map([
      [shape, objectShape],
    ]),
    iterationFacts: new Map([
      [statement, {
        operationId: "test.objectShape.keys",
        iterationKind: "property-key",
        lowering: { kind: "object-shape-keys" },
        elementType: csharpStringTargetType(),
      }],
    ]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.equal(output[0].kind, "Block");
  const statements = output[0].body.statements;
  assert.equal(statements[0].name, "__tsonic_forInTarget0");
  assert.deepEqual(statements[1], {
    kind: "LocalDeclarationStatement",
    name: "__tsonic_forInKeys0",
    type: { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "string" } },
    initializer: {
      kind: "ArrayCreationExpression",
      elementType: { kind: "PredefinedType", name: "string" },
      elements: [
        { kind: "LiteralExpression", value: "alpha" },
        { kind: "LiteralExpression", value: "beta" },
      ],
    },
  });
  assert.equal(statements[2].kind, "ForStatement");
  assert.deepEqual(statements[2].body.statements[0].initializer, {
    kind: "ElementAccessExpression",
    receiver: { kind: "IdentifierName", name: "__tsonic_forInKeys0" },
    argument: { kind: "IdentifierName", name: "__tsonic_forInIndex0" },
  });
});
test("for-in emits provider dictionary key foreach from finalized key-collection facts", () => {
  const diagnostics = [];
  const keyName = identifier("key");
  const dictionary = identifier("dictionary");
  const statement = forInStatement(
    variableDeclarationList([{ Kind: KindVariableDeclaration, name: keyName }]),
    dictionary,
    block([]),
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [keyName, { carrier: csharpStringTargetType() }],
      [dictionary, { carrier: recordDictionaryType(csharpStringTargetType(), csharpSourcePrimitiveTargetType("int32")) }],
    ]),
    iterationFacts: new Map([
      [statement, {
        operationId: "test.dictionary.keys",
        iterationKind: "property-key",
        lowering: { kind: "key-collection", keysMember: dictionaryKeysOperation() },
        elementType: csharpStringTargetType(),
      }],
    ]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.equal(output[0].kind, "Block");
  const foreachStatement = output[0].body.statements[1];
  assert.deepEqual(foreachStatement, {
    kind: "ForEachStatement",
    itemType: { kind: "PredefinedType", name: "string" },
    itemName: "key",
    collection: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "__tsonic_forInTarget0" },
      name: "Keys",
    },
    body: { kind: "Block", statements: [] },
  });
});
test("throw statements require finalized throwable target carriers", () => {
  const diagnostics = [];
  const thrown = identifier("error");
  const statement = {
    Kind: "KindThrowStatement",
    Expression: thrown,
  };

  const rejected = planStatements(statement, sourceFile, fakeInput(), diagnostics);
  assert.deepEqual(rejected, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Throw statements require finalized TSTS\/provider exception-carrier facts/);

  diagnostics.length = 0;
  const accepted = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [thrown, { carrier: csharpExceptionTargetType() }],
    ]),
  }), diagnostics);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(accepted, [{
    kind: "ThrowStatement",
    expression: { kind: "IdentifierName", name: "error" },
  }]);
});
test("throw statements accept provider-backed exception carriers only through throwable metadata", () => {
  const sourceExample = `
    import { CustomException } from "@example/errors";
    throw error;
  `;
  assert.match(sourceExample, /CustomException/);
  const diagnostics = [];
  const thrown = identifier("error");
  const statement = throwStatement(thrown);
  const customException = csharpTargetNamedType(
    "Example.Errors.CustomException",
    undefined,
    csharpQualifiedTypeRenderShape("Example.Errors", "CustomException"),
    { throwable: true },
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [thrown, { carrier: customException }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [{
    kind: "ThrowStatement",
    expression: { kind: "IdentifierName", name: "error" },
  }]);
});
test("compat throw statements wrap closed non-exception carriers through finalized runtime facts", () => {
  const diagnostics = [];
  const thrown = identifier("message");
  const statement = throwStatement(thrown);

  const output = planStatements(statement, sourceFile, fakeInput({
    target: { id: "csharp", options: { typescriptCompatibility: "compat" } },
    runtimeCarrierFacts: new Map([
      [thrown, { carrier: csharpStringTargetType() }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [{
    kind: "ThrowStatement",
    expression: {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: {
          kind: "QualifiedName",
          left: {
            kind: "QualifiedName",
            left: {
              kind: "QualifiedName",
              left: { kind: "IdentifierName", name: "Tsonic" },
              name: "CSharp",
            },
            name: "Js",
          },
          name: "TsThrownValueException",
        },
        name: "from",
      },
      arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name: "message" } }],
    },
  }]);
});
test("destructuring assignment statements fail closed without ordinary assignment fallback", () => {
  const diagnostics = [];
  const arrayAssignment = expressionStatement(binaryExpression(
    {
      Kind: KindArrayLiteralExpression,
      Elements: { Nodes: [identifier("first")] },
    },
    identifier("source"),
  ));
  const objectAssignment = expressionStatement(binaryExpression(
    {
      Kind: KindObjectLiteralExpression,
      Properties: { Nodes: [{ Kind: "KindShorthandPropertyAssignment", name: identifier("name") }] },
    },
    identifier("source"),
  ));
  const statement = block([arrayAssignment, objectAssignment]);

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(output, [{
    kind: "Block",
    body: {
      kind: "Block",
      statements: [],
    },
  }]);
  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0].message, /Destructuring assignment emission requires finalized target storage and extraction facts/);
  assert.match(diagnostics[1].message, /Destructuring assignment emission requires finalized target storage and extraction facts/);
});