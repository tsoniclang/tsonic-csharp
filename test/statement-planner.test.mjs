import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import {
  createDestructuringPlannerState,
} from "../dist/backend/planner/bindings.js";
import {
  planStatements,
} from "../dist/backend/planner/statements.js";
import {
  KindBlock,
  KindBreakStatement,
  KindContinueStatement,
  KindDefaultClause,
  KindDoStatement,
  KindArrayLiteralExpression,
  KindBinaryExpression,
  KindEqualsToken,
  KindExpressionStatement,
  KindForStatement,
  KindForInStatement,
  KindForOfStatement,
  KindIdentifier,
  KindLabeledStatement,
  KindNumericLiteral,
  KindObjectLiteralExpression,
  KindSwitchStatement,
  KindTryStatement,
  KindTrueKeyword,
  KindVariableDeclaration,
  KindVariableDeclarationList,
  KindWhileStatement,
} from "../dist/backend/planner/source-ast.js";
import {
  csharpObjectShapeFactKey,
  csharpTargetIterationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpExceptionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";

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

test("try statements emit Roslyn catch and finally bodies from finalized exception facts", () => {
  const diagnostics = [];
  const thrown = identifier("error");
  const catchName = identifier("caught");
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
      [thrown, { carrier: csharpExceptionTargetType() }],
      [catchName, { carrier: csharpExceptionTargetType() }],
    ]),
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
        left: { kind: "IdentifierName", name: "System" },
        name: "Exception",
      },
      variableName: "caught",
      body: { kind: "Block", statements: [] },
    },
    finallyBody: { kind: "Block", statements: [] },
  }]);
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

function switchStatement(expression, clauses) {
  return {
    Kind: KindSwitchStatement,
    Expression: expression,
    CaseBlock: {
      Kind: "KindCaseBlock",
      Clauses: { Nodes: clauses },
    },
  };
}

function caseClause(expression, statements) {
  return {
    Kind: "KindCaseClause",
    Expression: expression,
    Statements: { Nodes: statements },
  };
}

function defaultClause(statements) {
  return {
    Kind: KindDefaultClause,
    Statements: { Nodes: statements },
  };
}

function labeledStatement(label, statement) {
  return {
    Kind: KindLabeledStatement,
    Label: identifier(label),
    Statement: statement,
  };
}

function whileStatement(expression, statement) {
  return {
    Kind: KindWhileStatement,
    Expression: expression,
    Statement: statement,
  };
}

function doStatement(expression, statement) {
  return {
    Kind: KindDoStatement,
    Expression: expression,
    Statement: statement,
  };
}

function forStatement(initializer, condition, incrementor, statement) {
  return {
    Kind: KindForStatement,
    Initializer: initializer,
    Condition: condition,
    Incrementor: incrementor,
    Statement: statement,
  };
}

function forOfStatement(initializer, expression, statement) {
  return {
    Kind: KindForOfStatement,
    Initializer: initializer,
    Expression: expression,
    Statement: statement,
  };
}

function forInStatement(initializer, expression, statement) {
  return {
    Kind: KindForInStatement,
    Initializer: initializer,
    Expression: expression,
    Statement: statement,
  };
}

function tryStatement(tryBlock, catchClauseNode, finallyBlock) {
  return {
    Kind: KindTryStatement,
    TryBlock: tryBlock,
    ...(catchClauseNode === undefined ? {} : { CatchClause: catchClauseNode }),
    ...(finallyBlock === undefined ? {} : { FinallyBlock: finallyBlock }),
  };
}

function expressionStatement(expression) {
  return {
    Kind: KindExpressionStatement,
    Expression: expression,
  };
}

function binaryExpression(left, right) {
  return {
    Kind: KindBinaryExpression,
    Left: left,
    Right: right,
    OperatorToken: { Kind: KindEqualsToken },
  };
}

function catchClause(variableDeclarationNode, blockNode) {
  return {
    Kind: "KindCatchClause",
    ...(variableDeclarationNode === undefined ? {} : { VariableDeclaration: variableDeclarationNode }),
    Block: blockNode,
  };
}

function variableDeclarationList(declarations) {
  return {
    Kind: KindVariableDeclarationList,
    Declarations: { Nodes: declarations },
  };
}

function variableDeclaration(name, type) {
  return {
    Kind: KindVariableDeclaration,
    name: identifier(name),
    Type: type,
  };
}

function block(statements) {
  return {
    Kind: KindBlock,
    Statements: { Nodes: statements },
  };
}

function breakStatement(label) {
  return {
    Kind: KindBreakStatement,
    ...(label === undefined ? {} : { Label: label }),
  };
}

function continueStatement(label) {
  return {
    Kind: KindContinueStatement,
    ...(label === undefined ? {} : { Label: label }),
  };
}

function identifier(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

function numeric(text) {
  return {
    Kind: KindNumericLiteral,
    Text: text,
  };
}

function trueKeyword() {
  return {
    Kind: KindTrueKeyword,
  };
}

function throwStatement(expression) {
  return {
    Kind: "KindThrowStatement",
    Expression: expression,
  };
}

function typeNode(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: (subject) => options.runtimeCarrierFacts?.get(subject),
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
      getFact: (subject, key) => {
        if (key === csharpTargetIterationFactKey) {
          return options.iterationFacts?.get(subject);
        }
        if (key === csharpObjectShapeFactKey) {
          return options.objectShapeFacts?.get(subject);
        }
        return undefined;
      },
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getObjectShapeForNode: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolAtLocation: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      describeTypeAtLocation: () => undefined,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => runtimeCarrierResolution(options, subject),
      resolveRuntimeCarrierForNode: (subject) => runtimeCarrierResolution(options, subject),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
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
  };
}

function runtimeCarrierResolution(options, subject) {
  const fact = options.runtimeCarrierFacts?.get(subject);
  return fact === undefined
    ? missingCarrierResolution(options.missingRuntimeCarrierReason, options.missingRuntimeCarrierEvidence)
    : resolvedCarrierResolution(fact.carrier);
}

const sourceFile = {
  FileName: "/src/index.ts",
  IsDeclarationFile: false,
};

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  getSourceFile: () => sourceFile,
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

function stringCodePointIterationFact() {
  return {
    operationId: "test.string.codePoints",
    iterationKind: "sync",
    lowering: {
      kind: "string-code-point",
      lengthMember: "Length",
      substringMember: "Substring",
      highSurrogateOperation: charSurrogateOperation("IsHighSurrogate"),
      lowSurrogateOperation: charSurrogateOperation("IsLowSurrogate"),
    },
    elementType: csharpStringTargetType(),
  };
}

function charSurrogateOperation(memberName) {
  return {
    kind: "member",
    operationId: `System.Char.${memberName}`,
    operationKind: "method",
    memberName,
    static: true,
    declaringType: {
      kind: "target-named",
      id: "System.Char",
      csharpRender: { kind: "predefined", name: "char" },
    },
    resultType: csharpSourcePrimitiveTargetType("bool"),
  };
}

function objectShapeFact(name, members) {
  return {
    targetType: {
      kind: "target-named",
      id: `Test.${name}`,
      csharpRender: { kind: "named", namespace: ["Test"], name },
    },
    members,
  };
}

function recordDictionaryType(keyType, valueType) {
  return {
    kind: "target-named",
    id: "System.Collections.Generic.Dictionary`2",
    typeArguments: [keyType, valueType],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "Dictionary" },
    csharpCollectionSurface: "record",
  };
}

function dictionaryKeysOperation() {
  return {
    kind: "member",
    operationId: "System.Collections.Generic.Dictionary`2.Keys",
    operationKind: "property",
    memberName: "Keys",
    selectedMember: {
      id: "System.Collections.Generic.Dictionary`2.Keys",
      kind: "property",
      targetName: "Keys",
    },
  };
}
