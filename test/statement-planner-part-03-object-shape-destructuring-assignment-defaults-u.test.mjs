import { test, assert, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, createDestructuringPlannerState, planStatements, planLocalDeclaration, printCsharpType, KindBlock, KindBreakStatement, KindContinueStatement, KindDefaultClause, KindDoStatement, KindArrayLiteralExpression, KindAwaitExpression, KindBinaryExpression, KindEqualsToken, KindExpressionStatement, KindForStatement, KindForInStatement, KindForOfStatement, KindIdentifier, KindLabeledStatement, KindNumericLiteral, KindObjectBindingPattern, KindObjectLiteralExpression, KindSpreadElement, KindStringLiteral, KindSwitchStatement, KindTryStatement, KindTrueKeyword, KindVariableDeclaration, KindVariableDeclarationList, KindWhileStatement, csharpObjectShapeFactKey, csharpTargetOperationFactKey, csharpTargetIterationFactKey, csharpExceptionTargetType, csharpListTargetType, csharpNullableValueTargetType, csharpQualifiedTypeRenderShape, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType, csharpTaskTargetType, csharpVoidTargetType, csharpTsValueTargetType, csharpJsArrayCarrierTargetType, switchStatement, caseClause, defaultClause, labeledStatement, whileStatement, doStatement, forStatement, forOfStatement, forInStatement, tryStatement, expressionStatement, awaitExpression, binaryExpression, catchClause, variableDeclarationList, variableDeclaration, block, breakStatement, continueStatement, identifier, numeric, stringLiteral, trueKeyword, throwStatement, typeNode, fakeInput, runtimeCarrierResolution, sourceFile, providerReadOnlyIndexableTargetType, fakeAst, stringCodePointIterationFact, charSurrogateOperation, objectShapeFact, recordDictionaryType, dictionaryKeysOperation } from "./statement-planner.helpers.mjs";

test("object-shape destructuring assignment defaults use finalized nullable member carriers", () => {
  const sourceExample = "({ value = 7 } = input);";
  assert.match(sourceExample, /value = 7/);
  const diagnostics = [];
  const source = identifier("input");
  const assignment = binaryExpression(
    {
      Kind: KindObjectLiteralExpression,
      Properties: {
        Nodes: [
          { Kind: "KindShorthandPropertyAssignment", name: identifier("value"), ObjectAssignmentInitializer: numeric("7") },
        ],
      },
    },
    source,
  );
  const objectShape = {
    targetType: {
      kind: "target-named",
      id: "__InputShape",
      csharpRender: { kind: "named", name: "__InputShape" },
    },
    members: [
      {
        sourceName: "value",
        targetName: "Value",
        memberKind: "property",
        optional: true,
        type: csharpNullableValueTargetType(csharpSourcePrimitiveTargetType("int32")),
      },
    ],
  };

  const output = planStatements(
    expressionStatement(assignment),
    sourceFile,
    fakeInput({
      selectedOperatorFacts: new Map([[assignment, {
        operationId: "tsonic.csharp.operator.assign",
        operationKind: "operator",
        targetOperation: "=",
      }]]),
      csharpOperationFacts: new Map([[assignment, {
        kind: "operator-token",
        operationId: "tsonic.csharp.operator.assign",
        operator: "=",
      }]]),
      objectShapeFacts: new Map([[source, objectShape]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output[1].expression.right, {
    kind: "BinaryExpression",
    left: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
      name: "Value",
    },
    operatorToken: { kind: "QuestionQuestionToken" },
    right: { kind: "LiteralExpression", value: 7 },
  });
});
test("object-shape destructuring assignment supports finalized string-literal property keys", () => {
  const sourceExample = '({ "wire-name": value } = input);';
  assert.match(sourceExample, /wire-name/);
  const diagnostics = [];
  const source = identifier("input");
  const assignment = binaryExpression(
    {
      Kind: KindObjectLiteralExpression,
      Properties: {
        Nodes: [
          { Kind: "KindPropertyAssignment", name: stringLiteral("wire-name"), Initializer: identifier("value") },
        ],
      },
    },
    source,
  );
  const objectShape = {
    targetType: {
      kind: "target-named",
      id: "__InputShape",
      csharpRender: { kind: "named", name: "__InputShape" },
    },
    members: [
      {
        sourceName: "wire-name",
        targetName: "WireName",
        memberKind: "property",
        type: csharpStringTargetType(),
      },
    ],
  };

  const output = planStatements(
    expressionStatement(assignment),
    sourceFile,
    fakeInput({
      selectedOperatorFacts: new Map([[assignment, {
        operationId: "tsonic.csharp.operator.assign",
        operationKind: "operator",
        targetOperation: "=",
      }]]),
      csharpOperationFacts: new Map([[assignment, {
        kind: "operator-token",
        operationId: "tsonic.csharp.operator.assign",
        operator: "=",
      }]]),
      objectShapeFacts: new Map([[source, objectShape]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output[1].expression.right, {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
    name: "WireName",
  });
});
test("try statements emit Roslyn catch and finally bodies from finalized exception facts", () => {
  const sourceExample = `
    try {
      throw error;
    } catch (caught) {
    } finally {
    }
  `;
  assert.match(sourceExample, /finally/);
  const diagnostics = [];
  const thrown = identifier("error");
  const catchName = identifier("caught");
  const catchSymbol = {};
  const catchReference = identifier("caught");
  const customException = csharpTargetNamedType(
    "Example.Errors.CustomException",
    undefined,
    csharpQualifiedTypeRenderShape("Example.Errors", "CustomException"),
    { throwable: true },
  );
  const catchVariable = {
    Kind: KindVariableDeclaration,
    name: catchName,
  };
  const statement = tryStatement(
    block([throwStatement(thrown)]),
    catchClause(catchVariable, block([])),
    block([]),
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [thrown, { carrier: customException }],
      [catchName, { carrier: customException }],
    ]),
    symbols: new Map([[catchName, catchSymbol]]),
    references: new Map([[catchSymbol, [{ node: catchName }, { node: catchReference }]]]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [{
    kind: "TryStatement",
    tryBody: {
      kind: "Block",
      statements: [{
        kind: "ThrowStatement",
        expression: { kind: "IdentifierName", name: "error" },
      }],
    },
    catchClause: {
      kind: "CatchClause",
      variableType: {
        kind: "QualifiedName",
        left: {
          kind: "QualifiedName",
          left: { kind: "IdentifierName", name: "Example" },
          name: "Errors",
        },
        name: "CustomException",
      },
      variableName: "caught",
      body: { kind: "Block", statements: [] },
    },
    finallyBody: { kind: "Block", statements: [] },
  }]);
});
test("unused catch bindings emit catch-all clauses without warning-producing C# variables", () => {
  const diagnostics = [];
  const catchName = identifier("unused");
  const catchSymbol = {};
  const customException = csharpTargetNamedType(
    "Example.Errors.CustomException",
    undefined,
    csharpQualifiedTypeRenderShape("Example.Errors", "CustomException"),
    { throwable: true },
  );
  const statement = tryStatement(
    block([]),
    catchClause({ Kind: KindVariableDeclaration, name: catchName }, block([])),
    undefined,
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([[catchName, { carrier: customException }]]),
    symbols: new Map([[catchName, catchSymbol]]),
    references: new Map([[catchSymbol, [{ node: catchName }]]]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output[0].catchClause, {
    kind: "CatchClause",
    body: { kind: "Block", statements: [] },
  });
});
test("local storage consumes exact finalized byref target nullability", () => {
  const diagnostics = [];
  const name = identifier("value");
  const reference = identifier("value");
  const initializer = identifier("initialValue");
  const declaration = {
    Kind: KindVariableDeclaration,
    name,
    Initializer: initializer,
  };
  const symbol = {};
  const todoType = csharpTargetNamedType(
    "Example.Todo",
    undefined,
    csharpQualifiedTypeRenderShape("Example", "Todo"),
  );

  const output = planLocalDeclaration(declaration, sourceFile, fakeInput({
    symbols: new Map([[name, symbol]]),
    references: new Map([[symbol, [{ node: name, sourceFile }, { node: reference, sourceFile }]]]),
    csharpByrefStorageFacts: new Map([[reference, {
      targetType: { ...todoType, csharpNullableReference: true },
    }]]),
    resolvedRuntimeCarrierFacts: new Map([[initializer, { carrier: todoType }]]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpType(output.type), "Example.Todo?");
});
test("local storage rejects incompatible finalized byref target types", () => {
  const diagnostics = [];
  const name = identifier("value");
  const firstReference = identifier("value");
  const secondReference = identifier("value");
  const initializer = identifier("initialValue");
  const declaration = { Kind: KindVariableDeclaration, name, Initializer: initializer };
  const symbol = {};
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const string = csharpStringTargetType();

  planLocalDeclaration(declaration, sourceFile, fakeInput({
    symbols: new Map([[name, symbol]]),
    references: new Map([[symbol, [
      { node: firstReference, sourceFile },
      { node: secondReference, sourceFile },
    ]]]),
    csharpByrefStorageFacts: new Map([
      [firstReference, { targetType: int32 }],
      [secondReference, { targetType: string }],
    ]),
    resolvedRuntimeCarrierFacts: new Map([[initializer, { carrier: int32 }]]),
  }), diagnostics, createDestructuringPlannerState());

  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /incompatible finalized byref target parameter types/);
});
test("compat catch variables materialize closed TsValue carriers from caught exceptions", () => {
  const diagnostics = [];
  const thrown = identifier("message");
  const catchName = identifier("caught");
  const catchVariable = {
    Kind: KindVariableDeclaration,
    name: catchName,
  };
  const statement = tryStatement(
    block([throwStatement(thrown)]),
    catchClause(catchVariable, block([expressionStatement(catchName)])),
    block([]),
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    target: { id: "csharp", options: { typescriptCompatibility: "compat" } },
    runtimeCarrierFacts: new Map([
      [thrown, { carrier: csharpStringTargetType() }],
      [catchName, { carrier: csharpTsValueTargetType() }],
    ]),
  }), diagnostics, createDestructuringPlannerState());

  assert.deepEqual(diagnostics, []);
  assert.equal(output[0].kind, "TryStatement");
  assert.deepEqual(output[0].catchClause, {
    kind: "CatchClause",
    variableType: {
      kind: "QualifiedName",
      left: { kind: "IdentifierName", name: "System" },
      name: "Exception",
    },
    variableName: "__tsonic_catch0",
    body: {
      kind: "Block",
      statements: [
        {
          kind: "LocalDeclarationStatement",
          type: {
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
            name: "TsValue",
          },
          name: "caught",
          initializer: {
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
              name: "toValue",
            },
            arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name: "__tsonic_catch0" } }],
          },
        },
        {
          kind: "ExpressionStatement",
          expression: {
            kind: "AssignmentExpression",
            left: { kind: "IdentifierName", name: "_" },
            operatorToken: { kind: "EqualsToken" },
            right: { kind: "IdentifierName", name: "caught" },
          },
        },
      ],
    },
  });
});
test("catch variables fail closed without finalized exception carrier facts", () => {
  const diagnostics = [];
  const catchName = identifier("caught");
  const statement = tryStatement(
    block([]),
    catchClause({
      Kind: KindVariableDeclaration,
      name: catchName,
    }, block([])),
    undefined,
  );

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics, createDestructuringPlannerState());

  assert.equal(output[0].kind, "TryStatement");
  assert.deepEqual(output[0].catchClause, {
    kind: "CatchClause",
    body: { kind: "Block", statements: [] },
  });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Catch variables require finalized TSTS\/provider exception-carrier facts/);
});
test("catch variables reject finalized non-throwable carrier facts", () => {
  const sourceExample = `
    try {
    } catch (message) {
    }
  `;
  assert.match(sourceExample, /catch \(message\)/);
  const diagnostics = [];
  const catchName = identifier("message");
  const statement = tryStatement(
    block([]),
    catchClause({
      Kind: KindVariableDeclaration,
      name: catchName,
    }, block([])),
    undefined,
  );

  const output = planStatements(statement, sourceFile, fakeInput({
    runtimeCarrierFacts: new Map([
      [catchName, { carrier: csharpStringTargetType() }],
    ]),
  }), diagnostics, createDestructuringPlannerState());

  assert.equal(output[0].kind, "TryStatement");
  assert.deepEqual(output[0].catchClause, {
    kind: "CatchClause",
    body: { kind: "Block", statements: [] },
  });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Resolved catch variable carrier is neither a target throwable carrier nor a closed TsValue compatibility catch carrier/);
});
test("catch destructuring rejects until thrown-value extraction facts are available", () => {
  const diagnostics = [];
  const catchPattern = { Kind: KindObjectBindingPattern };
  const statement = tryStatement(
    block([]),
    catchClause({
      Kind: KindVariableDeclaration,
      name: catchPattern,
    }, block([])),
    undefined,
  );

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics, createDestructuringPlannerState());

  assert.equal(output[0].kind, "TryStatement");
  assert.deepEqual(output[0].catchClause, {
    kind: "CatchClause",
    body: { kind: "Block", statements: [] },
  });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Catch destructuring requires a closed thrown-value carrier/);
});
