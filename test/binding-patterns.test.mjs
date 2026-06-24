import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDestructuringPlannerState,
  planParameterBindingPrelude,
} from "../dist/backend/planner/bindings.js";
import {
  csharpObjectShapeFactKey,
} from "../dist/source/csharp-facts.js";
import {
  KindArrayBindingPattern,
  KindBindingElement,
  KindIdentifier,
  KindObjectBindingPattern,
  KindParameter,
} from "../dist/backend/planner/source-ast.js";

test("parameter array destructuring emits from binding AST and finalized array carrier facts", () => {
  const first = identifier("first");
  const second = identifier("second");
  const pattern = arrayBindingPattern([
    bindingElement(first),
    bindingElement(second),
  ]);
  const parameter = parameterDeclaration(pattern);
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      runtimeCarrierSubject: parameter,
      runtimeCarrier: {
        carrier: {
          kind: "array",
          element: { kind: "source-primitive", name: "int32" },
        },
      },
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(statements, [
    {
      kind: "LocalDeclarationStatement",
      name: "first",
      type: { kind: "PredefinedType", name: "int" },
      initializer: {
        kind: "ElementAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        argument: { kind: "LiteralExpression", value: 0 },
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "second",
      type: { kind: "PredefinedType", name: "int" },
      initializer: {
        kind: "ElementAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        argument: { kind: "LiteralExpression", value: 1 },
      },
    },
  ]);
});

test("parameter object destructuring emits from finalized object-shape extraction facts", () => {
  const count = identifier("count");
  const pattern = objectBindingPattern([
    bindingElement(count),
  ]);
  const parameter = parameterDeclaration(pattern);
  const objectShape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "count",
      targetName: "Count",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      objectShapeSubject: parameter,
      objectShape,
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(statements, [{
    kind: "LocalDeclarationStatement",
    name: "count",
    type: { kind: "PredefinedType", name: "int" },
    initializer: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "value" },
      name: "Count",
    },
  }]);
});

test("parameter destructuring fails closed without carrier or object-shape facts", () => {
  const pattern = arrayBindingPattern([
    bindingElement(identifier("first")),
  ]);
  parameterDeclaration(pattern);
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput(),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(statements, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Array destructuring requires a finalized provider array or tuple runtime-carrier fact/);
});

function parameterDeclaration(name) {
  const parameter = {
    Kind: KindParameter,
    name,
  };
  name.Parent = parameter;
  return parameter;
}

function arrayBindingPattern(elements) {
  return {
    Kind: KindArrayBindingPattern,
    Elements: { Nodes: elements },
  };
}

function objectBindingPattern(elements) {
  return {
    Kind: KindObjectBindingPattern,
    Elements: { Nodes: elements },
  };
}

function bindingElement(name) {
  return {
    Kind: KindBindingElement,
    name,
  };
}

function identifier(text) {
  return {
    Kind: KindIdentifier,
    Text: text,
  };
}

function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getTargetBindingFact: () => undefined,
      getFact: (subject, key) => subject === options.objectShapeSubject && key === csharpObjectShapeFactKey
        ? options.objectShape
        : undefined,
      getRuntimeCarrierFact: (subject) => subject === options.runtimeCarrierSubject
        ? options.runtimeCarrier
        : undefined,
      getSourcePrimitiveFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getStructFact: () => undefined,
      getFieldFact: () => undefined,
      getAttributeFact: () => undefined,
      getDefaultValueFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
    },
    semantics: {
      getProjectSourceReferenceForNode: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      getRuntimeCarrierForNode: () => undefined,
      getTargetBindingForReference: () => undefined,
      isProjectSourceShapeForNode: () => false,
    },
  };
}

const sourceFile = {};

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  name: (node) => node?.name,
  text: (node) => String(node?.Text ?? ""),
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
