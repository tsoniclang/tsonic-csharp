import { test, assert, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, createDestructuringPlannerState, planStatements, planLocalDeclaration, printCsharpType, KindBlock, KindBreakStatement, KindContinueStatement, KindDefaultClause, KindDoStatement, KindArrayLiteralExpression, KindAwaitExpression, KindBinaryExpression, KindEqualsToken, KindExpressionStatement, KindForStatement, KindForInStatement, KindForOfStatement, KindIdentifier, KindLabeledStatement, KindNumericLiteral, KindObjectBindingPattern, KindObjectLiteralExpression, KindSpreadElement, KindStringLiteral, KindSwitchStatement, KindTryStatement, KindTrueKeyword, KindVariableDeclaration, KindVariableDeclarationList, KindWhileStatement, csharpObjectShapeFactKey, csharpTargetOperationFactKey, csharpTargetIterationFactKey, csharpExceptionTargetType, csharpListTargetType, csharpNullableValueTargetType, csharpQualifiedTypeRenderShape, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType, csharpTaskTargetType, csharpVoidTargetType, csharpTsValueTargetType, csharpJsArrayCarrierTargetType, switchStatement, caseClause, defaultClause, labeledStatement, whileStatement, doStatement, forStatement, forOfStatement, forInStatement, tryStatement, expressionStatement, awaitExpression, binaryExpression, catchClause, variableDeclarationList, variableDeclaration, block, breakStatement, continueStatement, identifier, numeric, stringLiteral, trueKeyword, throwStatement, typeNode, fakeInput, runtimeCarrierResolution, sourceFile, providerReadOnlyIndexableTargetType, fakeAst, stringCodePointIterationFact, charSurrogateOperation, objectShapeFact, recordDictionaryType, dictionaryKeysOperation } from "./statement-planner.helpers.mjs";

test("array destructuring assignment statements emit storage writes from finalized facts", () => {
  const diagnostics = [];
  const source = identifier("values");
  const assignment = binaryExpression(
    {
      Kind: KindArrayLiteralExpression,
      Elements: { Nodes: [identifier("first"), identifier("second")] },
    },
    source,
  );
  const intType = csharpSourcePrimitiveTargetType("int32");
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
      runtimeCarrierFacts: new Map([[source, { carrier: { kind: "array", element: intType } }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [
    {
      kind: "LocalDeclarationStatement",
      name: "__tsonic_destructure0",
      type: { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } },
      initializer: { kind: "IdentifierName", name: "values" },
    },
    {
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "first" },
        operatorToken: { kind: "EqualsToken" },
        right: {
          kind: "ElementAccessExpression",
          receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
          argument: { kind: "LiteralExpression", value: 0 },
        },
      },
    },
    {
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "second" },
        operatorToken: { kind: "EqualsToken" },
        right: {
          kind: "ElementAccessExpression",
          receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
          argument: { kind: "LiteralExpression", value: 1 },
        },
      },
    },
  ]);
});
test("array destructuring assignment consumes finalized target carrier resolution", () => {
  const sourceExample = "[first] = values;";
  assert.match(sourceExample, /\[first\] = values/);
  const diagnostics = [];
  const source = identifier("values");
  const assignment = binaryExpression(
    {
      Kind: KindArrayLiteralExpression,
      Elements: { Nodes: [identifier("first")] },
    },
    source,
  );
  const intType = csharpSourcePrimitiveTargetType("int32");
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
      resolvedRuntimeCarrierFacts: new Map([[source, { carrier: { kind: "array", element: intType } }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [
    {
      kind: "LocalDeclarationStatement",
      name: "__tsonic_destructure0",
      type: { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } },
      initializer: { kind: "IdentifierName", name: "values" },
    },
    {
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "first" },
        operatorToken: { kind: "EqualsToken" },
        right: {
          kind: "ElementAccessExpression",
          receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
          argument: { kind: "LiteralExpression", value: 0 },
        },
      },
    },
  ]);
});
test("array destructuring assignment consumes read-only indexable carrier facts", () => {
  const sourceExample = "[first, ...rest] = values;";
  assert.match(sourceExample, /\.\.\.rest/);
  const diagnostics = [];
  const source = identifier("values");
  const restElement = {
    Kind: KindSpreadElement,
    Expression: identifier("rest"),
  };
  const assignment = binaryExpression(
    {
      Kind: KindArrayLiteralExpression,
      Elements: { Nodes: [identifier("first"), restElement] },
    },
    source,
  );
  const carrier = providerReadOnlyIndexableTargetType(csharpSourcePrimitiveTargetType("int32"));

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
      runtimeCarrierFacts: new Map([[source, { carrier }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output[1].expression.right, {
    kind: "ElementAccessExpression",
    receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
    argument: { kind: "LiteralExpression", value: 0 },
  });
  assert.deepEqual(output[2].expression.right, {
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
        name: "Array",
      },
      name: "slice",
    },
    arguments: [
      { kind: "Argument", expression: { kind: "IdentifierName", name: "__tsonic_destructure0" } },
      { kind: "Argument", expression: { kind: "LiteralExpression", value: 1 } },
    ],
  });
});
test("array destructuring assignment over JSArray carriers uses finalized hole checks for defaults", () => {
  const sourceExample = "[first = 7] = values;";
  assert.match(sourceExample, /first = 7/);
  const diagnostics = [];
  const source = identifier("values");
  const assignment = binaryExpression(
    {
      Kind: KindArrayLiteralExpression,
      Elements: { Nodes: [binaryExpression(identifier("first"), numeric("7"))] },
    },
    source,
  );
  const carrier = csharpJsArrayCarrierTargetType(csharpSourcePrimitiveTargetType("int32"));

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
      runtimeCarrierFacts: new Map([[source, { carrier }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output[1].expression.right.condition, {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
      name: "hasIndex",
    },
    arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: 0 } }],
  });
});
test("tuple destructuring assignment emits rest tuple from finalized carrier facts", () => {
  const diagnostics = [];
  const source = identifier("values");
  const restElement = {
    Kind: KindSpreadElement,
    Expression: identifier("rest"),
  };
  const assignment = binaryExpression(
    {
      Kind: KindArrayLiteralExpression,
      Elements: { Nodes: [identifier("first"), restElement] },
    },
    source,
  );
  const stringType = csharpStringTargetType();
  const intType = csharpSourcePrimitiveTargetType("int32");
  const boolType = csharpSourcePrimitiveTargetType("bool");
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
      runtimeCarrierFacts: new Map([[source, { carrier: { kind: "tuple", elements: [stringType, intType, boolType] } }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [
    {
      kind: "LocalDeclarationStatement",
      name: "__tsonic_destructure0",
      type: {
        kind: "TupleType",
        elements: [
          { kind: "PredefinedType", name: "string" },
          { kind: "PredefinedType", name: "int" },
          { kind: "PredefinedType", name: "bool" },
        ],
      },
      initializer: { kind: "IdentifierName", name: "values" },
    },
    {
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "first" },
        operatorToken: { kind: "EqualsToken" },
        right: {
          kind: "SimpleMemberAccessExpression",
          receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
          name: "Item1",
        },
      },
    },
    {
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "rest" },
        operatorToken: { kind: "EqualsToken" },
        right: {
          kind: "TupleExpression",
          elements: [
            {
              kind: "SimpleMemberAccessExpression",
              receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
              name: "Item2",
            },
            {
              kind: "SimpleMemberAccessExpression",
              receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
              name: "Item3",
            },
          ],
        },
      },
    },
  ]);
});
test("tuple destructuring assignment emits one-element rest as System.ValueTuple from finalized carrier facts", () => {
  const diagnostics = [];
  const source = identifier("values");
  const restElement = {
    Kind: KindSpreadElement,
    Expression: identifier("rest"),
  };
  const assignment = binaryExpression(
    {
      Kind: KindArrayLiteralExpression,
      Elements: { Nodes: [identifier("first"), restElement] },
    },
    source,
  );
  const stringType = csharpStringTargetType();
  const intType = csharpSourcePrimitiveTargetType("int32");
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
      runtimeCarrierFacts: new Map([[source, { carrier: { kind: "tuple", elements: [stringType, intType] } }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output[2], {
    kind: "ExpressionStatement",
    expression: {
      kind: "AssignmentExpression",
      left: { kind: "IdentifierName", name: "rest" },
      operatorToken: { kind: "EqualsToken" },
      right: {
        kind: "ObjectCreationExpression",
        type: {
          kind: "QualifiedName",
          left: { kind: "IdentifierName", name: "System" },
          name: "ValueTuple",
          typeArguments: [{ kind: "PredefinedType", name: "int" }],
        },
        arguments: [{
          kind: "Argument",
          expression: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
            name: "Item2",
          },
        }],
      },
    },
  });
});
test("array destructuring assignment diagnostics preserve missing carrier evidence", () => {
  const sourceExample = "[first] = values;";
  assert.match(sourceExample, /\[first\] = values/);
  const diagnostics = [];
  const source = identifier("values");
  const assignment = binaryExpression(
    {
      Kind: KindArrayLiteralExpression,
      Elements: { Nodes: [identifier("first")] },
    },
    source,
  );

  planStatements(
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
      missingRuntimeCarrierReason: "assignment source carrier was not finalized",
      missingRuntimeCarrierEvidence: [{ message: "array destructuring assignment source lacked a finalized carrier fact" }],
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0].message, /assignment source carrier was not finalized/);
  assert.deepEqual(diagnostics[0].evidence, ["array destructuring assignment source lacked a finalized carrier fact"]);
  assert.match(diagnostics[1].message, /Array destructuring assignment requires a finalized provider array or tuple runtime-carrier fact/);
  assert.match(diagnostics[1].message, /assignment source carrier was not finalized/);
  assert.deepEqual(diagnostics[1].evidence, ["array destructuring assignment source lacked a finalized carrier fact"]);
});
test("await expression statements emit await directly instead of assigning void results", () => {
  const diagnostics = [];
  const task = identifier("task");
  const statement = expressionStatement(awaitExpression(task));
  const output = planStatements(
    statement,
    sourceFile,
    fakeInput({
      runtimeCarrierFacts: new Map([
        [task, { carrier: csharpTaskTargetType(csharpVoidTargetType()) }],
        [statement.Expression, { carrier: csharpVoidTargetType() }],
      ]),
    }),
    diagnostics,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(output, [{
    kind: "ExpressionStatement",
    expression: {
      kind: "AwaitExpression",
      expression: {
        kind: "IdentifierName",
        name: "task",
      },
    },
  }]);
});
test("object-shape destructuring assignment statements emit storage writes from finalized facts", () => {
  const diagnostics = [];
  const source = identifier("input");
  const assignment = binaryExpression(
    {
      Kind: KindObjectLiteralExpression,
      Properties: {
        Nodes: [
          { Kind: "KindShorthandPropertyAssignment", name: identifier("value") },
          { Kind: "KindPropertyAssignment", name: identifier("label"), Initializer: identifier("name") },
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
        type: csharpSourcePrimitiveTargetType("int32"),
      },
      {
        sourceName: "label",
        targetName: "Label",
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
  assert.deepEqual(output, [
    {
      kind: "LocalDeclarationStatement",
      name: "__tsonic_destructure0",
      type: { kind: "IdentifierName", name: "__InputShape" },
      initializer: { kind: "IdentifierName", name: "input" },
    },
    {
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "value" },
        operatorToken: { kind: "EqualsToken" },
        right: {
          kind: "SimpleMemberAccessExpression",
          receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
          name: "Value",
        },
      },
    },
    {
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "name" },
        operatorToken: { kind: "EqualsToken" },
        right: {
          kind: "SimpleMemberAccessExpression",
          receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
          name: "Label",
        },
      },
    },
  ]);
});
test("object rest destructuring assignment fails closed without rest target facts", () => {
  const diagnostics = [];
  const source = identifier("input");
  const assignment = binaryExpression(
    {
      Kind: KindObjectLiteralExpression,
      Properties: {
        Nodes: [
          { Kind: "KindShorthandPropertyAssignment", name: identifier("value") },
          { Kind: "KindSpreadAssignment", Expression: identifier("rest") },
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
        type: csharpSourcePrimitiveTargetType("int32"),
      },
      {
        sourceName: "label",
        targetName: "Label",
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

  assert.deepEqual(output.slice(0, 2), [
    {
      kind: "LocalDeclarationStatement",
      name: "__tsonic_destructure0",
      type: { kind: "IdentifierName", name: "__InputShape" },
      initializer: { kind: "IdentifierName", name: "input" },
    },
    {
      kind: "ExpressionStatement",
      expression: {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "value" },
        operatorToken: { kind: "EqualsToken" },
        right: {
          kind: "SimpleMemberAccessExpression",
          receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
          name: "Value",
        },
      },
    },
  ]);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object rest destructuring assignment requires finalized provider object-shape facts for the rest target/);
});