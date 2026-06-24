import { test } from "node:test";
import assert from "node:assert/strict";
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
  KindForOfStatement,
  KindIdentifier,
  KindLabeledStatement,
  KindNumericLiteral,
  KindSwitchStatement,
  KindTrueKeyword,
  KindVariableDeclaration,
  KindVariableDeclarationList,
  KindWhileStatement,
} from "../dist/backend/planner/source-ast.js";
import {
  csharpTargetIterationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpExceptionTargetType,
  csharpSourcePrimitiveTargetType,
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

test("conditions fail closed without finalized bool carrier facts", () => {
  const diagnostics = [];
  const statement = whileStatement(identifier("flag"), block([]));

  const output = planStatements(statement, sourceFile, fakeInput(), diagnostics);

  assert.equal(output[0].kind, "WhileStatement");
  assert.deepEqual(output[0].condition, {
    kind: "InvalidExpression",
    reason: "non-bool condition expression",
  });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /condition requires a finalized C# bool runtime carrier/);
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

function forOfStatement(initializer, expression, statement) {
  return {
    Kind: KindForOfStatement,
    Initializer: initializer,
    Expression: expression,
    Statement: statement,
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
        return undefined;
      },
    },
    semantics: {
      getTargetBindingForReference: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getRuntimeCarrierForNode: () => undefined,
      getObjectShapeForNode: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolAtLocation: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      describeTypeAtLocation: () => undefined,
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
