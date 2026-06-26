import assert from "node:assert/strict";
import test from "node:test";
import {
  KindCallExpression,
  KindIdentifier,
  KindNullKeyword,
  KindObjectLiteralExpression,
  KindPropertyAssignment,
  KindVariableDeclaration,
} from "../dist/backend/planner/source-ast.js";
import { planValueTypeDeclaration } from "../dist/backend/planner/value-types.js";

test("planner emits value-type fields only from finalized struct and field facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const xInitializer = node(KindCallExpression);
  const yInitializer = node(KindCallExpression);
  const xProperty = propertyAssignment("x", xInitializer);
  const yProperty = propertyAssignment("y", yInitializer);
  const declaration = variableDeclaration("Point", callExpression(objectLiteral([xProperty, yProperty])));
  const fieldFacts = new Map([
    [xInitializer, fieldFact("x")],
    [yInitializer, fieldFact("y")],
  ]);
  const diagnostics = [];

  const planned = planValueTypeDeclaration(declaration, {
    valueType: true,
    fields: [...fieldFacts.values()],
  }, sourceFile, fakeInput(sourceFile, { fieldFacts }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(planned.kind, "StructDeclaration");
  assert.equal(planned.name, "Point");
  assert.deepEqual(planned.modifiers, ["public"]);
  assert.deepEqual(planned.members.map((member) => ({
    kind: member.kind,
    name: member.name,
    modifiers: member.modifiers,
    type: member.type,
  })), [
    {
      kind: "FieldDeclaration",
      name: "x",
      modifiers: ["public"],
      type: { kind: "PredefinedType", name: "int" },
    },
    {
      kind: "FieldDeclaration",
      name: "y",
      modifiers: ["public"],
      type: { kind: "PredefinedType", name: "int" },
    },
  ]);
});

test("planner diagnoses struct markers whose field shape is not an object literal", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const declaration = variableDeclaration("Bad", callExpression(node(KindNullKeyword)));
  const diagnostics = [];

  const planned = planValueTypeDeclaration(declaration, {
    valueType: true,
    fields: [],
  }, sourceFile, fakeInput(sourceFile), diagnostics);

  assert.equal(planned.kind, "StructDeclaration");
  assert.equal(planned.name, "Bad");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_UNSUPPORTED_AST");
  assert.match(diagnostics[0].message, /object-literal field shape/);
});

test("planner rejects struct field names without finalized field facts", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const initializer = node(KindCallExpression);
  const declaration = variableDeclaration("Point", callExpression(objectLiteral([
    propertyAssignment("x", initializer),
  ])));
  const diagnostics = [];

  const planned = planValueTypeDeclaration(declaration, {
    valueType: true,
    fields: [],
  }, sourceFile, fakeInput(sourceFile), diagnostics);

  assert.equal(planned.kind, "StructDeclaration");
  assert.deepEqual(planned.members, []);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_UNSUPPORTED_AST");
  assert.match(diagnostics[0].message, /Value-type member 'x' requires a finalized field fact/);
});

function node(kind, properties = {}) {
  return { Kind: kind, ...properties };
}

function sourceFileNode(fileName) {
  return node("KindSourceFile", {
    FileName: fileName,
    IsDeclarationFile: false,
    Statements: { Nodes: [] },
  });
}

function identifier(text) {
  return node(KindIdentifier, { Text: text });
}

function callExpression(argument) {
  return node(KindCallExpression, {
    Arguments: { Nodes: [argument] },
  });
}

function objectLiteral(properties) {
  return node(KindObjectLiteralExpression, {
    Properties: { Nodes: properties },
  });
}

function propertyAssignment(name, initializer) {
  return node(KindPropertyAssignment, {
    name: identifier(name),
    Initializer: initializer,
  });
}

function variableDeclaration(name, initializer) {
  return node(KindVariableDeclaration, {
    name: identifier(name),
    Initializer: initializer,
  });
}

function fieldFact(name) {
  return {
    name,
    type: { kind: "source-primitive", name: "int32" },
  };
}

function fakeInput(sourceFile, options = {}) {
  const fieldFacts = options.fieldFacts ?? new Map();
  return {
    ast: {
      kindName: (candidate) => String(candidate?.Kind ?? "Undefined"),
      kindNameFromKind: (kind) => String(kind),
      text: (candidate) => String(candidate?.Text ?? ""),
      name: (candidate) => candidate?.name,
      parameters: () => [],
      getSourceFile: () => sourceFile,
      forEachChild: () => {},
      is: {},
    },
    sourceFiles: [sourceFile],
    facts: {
      getFieldFact: (subject) => fieldFacts.get(subject),
      getAttributeFact: () => undefined,
      getFact: () => undefined,
    },
    analysis: {
      getProjectSourceReferenceForNode: () => undefined,
      getProjectSourceDeclarationForNode: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
    },
  };
}
