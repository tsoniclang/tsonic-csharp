import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
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
  KindNumericLiteral,
  KindObjectBindingPattern,
  KindParameter,
  KindTypeLiteral,
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

test("parameter object destructuring reads finalized object-shape facts from type annotations", () => {
  const value = identifier("value");
  const pattern = objectBindingPattern([
    bindingElement(value),
  ]);
  const typeLiteral = { Kind: KindTypeLiteral };
  const parameter = parameterDeclaration(pattern, { type: typeLiteral });
  const objectShape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "float64" },
    }],
  };
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "__tsonic_param0",
    sourceFile,
    fakeInput({
      objectShapes: new Map([[typeLiteral, objectShape]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(statements, [{
    kind: "LocalDeclarationStatement",
    name: "value",
    type: { kind: "PredefinedType", name: "double" },
    initializer: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "__tsonic_param0" },
      name: "value",
    },
  }]);
  assert.equal(parameter.Type, typeLiteral);
});

test("nested object parameter destructuring uses finalized nested object-shape facts", () => {
  const count = identifier("count");
  const nestedPattern = objectBindingPattern([
    bindingElement(count),
  ]);
  const nestedElement = bindingElement(nestedPattern, { propertyName: identifier("inner") });
  const pattern = objectBindingPattern([
    nestedElement,
  ]);
  const parameter = parameterDeclaration(pattern);
  const innerShape = {
    targetType: {
      kind: "target-named",
      id: "__InnerShape",
      csharpRender: { kind: "named", name: "__InnerShape" },
    },
    members: [{
      sourceName: "count",
      targetName: "Count",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const outerShape = {
    targetType: {
      kind: "target-named",
      id: "__OuterShape",
      csharpRender: { kind: "named", name: "__OuterShape" },
    },
    members: [{
      sourceName: "inner",
      targetName: "Inner",
      memberKind: "property",
      type: innerShape.targetType,
    }],
  };
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      objectShapes: new Map([
        [parameter, outerShape],
        [nestedElement, innerShape],
      ]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(statements, [
    {
      kind: "LocalDeclarationStatement",
      name: "__tsonic_destructure0",
      type: { kind: "IdentifierName", name: "__InnerShape" },
      initializer: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        name: "Inner",
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "count",
      type: { kind: "PredefinedType", name: "int" },
      initializer: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
        name: "Count",
      },
    },
  ]);
});

test("nested object parameter destructuring fails closed without nested object-shape facts", () => {
  const count = identifier("count");
  const nestedPattern = objectBindingPattern([
    bindingElement(count),
  ]);
  const nestedElement = bindingElement(nestedPattern, { propertyName: identifier("inner") });
  const pattern = objectBindingPattern([
    nestedElement,
  ]);
  const parameter = parameterDeclaration(pattern);
  const outerShape = {
    targetType: {
      kind: "target-named",
      id: "__OuterShape",
      csharpRender: { kind: "named", name: "__OuterShape" },
    },
    members: [{
      sourceName: "inner",
      targetName: "Inner",
      memberKind: "property",
      type: {
        kind: "target-named",
        id: "__InnerShape",
        csharpRender: { kind: "named", name: "__InnerShape" },
      },
    }],
  };
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      objectShapes: new Map([[parameter, outerShape]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(statements, [{
    kind: "LocalDeclarationStatement",
    name: "__tsonic_destructure0",
    type: { kind: "IdentifierName", name: "__InnerShape" },
    initializer: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "value" },
      name: "Inner",
    },
  }]);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object destructuring requires a source-owned declaration or finalized provider object-shape facts/);
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

test("parameter destructuring diagnostics preserve missing carrier reason and evidence", () => {
  const pattern = arrayBindingPattern([
    bindingElement(identifier("first")),
  ]);
  parameterDeclaration(pattern);
  const diagnostics = [];

  planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      missingRuntimeCarrierReason: "parameter array carrier was not finalized",
      missingRuntimeCarrierEvidence: [{ message: "binding parameter T[] lacked array carrier fact" }],
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /parameter array carrier was not finalized/);
  assert.deepEqual(diagnostics[0].evidence, ["binding parameter T[] lacked array carrier fact"]);
});

test("nested array parameter destructuring uses finalized nested array carrier facts", () => {
  const inner = identifier("inner");
  const nestedElement = bindingElement(arrayBindingPattern([
    bindingElement(inner),
  ]));
  const rest = bindingElement(identifier("rest"), { rest: true });
  const pattern = arrayBindingPattern([nestedElement, rest]);
  const parameter = parameterDeclaration(pattern);
  const nestedArrayCarrier = {
    kind: "array",
    element: { kind: "source-primitive", name: "int32" },
  };
  const sourceArrayCarrier = {
    kind: "array",
    element: nestedArrayCarrier,
  };
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      runtimeCarriers: new Map([[parameter, { carrier: sourceArrayCarrier }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(statements, [
    {
      kind: "LocalDeclarationStatement",
      name: "__tsonic_destructure0",
      type: { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } },
      initializer: {
        kind: "ElementAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        argument: { kind: "LiteralExpression", value: 0 },
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "inner",
      type: { kind: "PredefinedType", name: "int" },
      initializer: {
        kind: "ElementAccessExpression",
        receiver: { kind: "IdentifierName", name: "__tsonic_destructure0" },
        argument: { kind: "LiteralExpression", value: 0 },
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "rest",
      type: { kind: "ArrayType", elementType: { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } } },
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
              name: "Runtime",
            },
            name: "ArrayHelpers",
          },
          name: "Slice",
        },
        arguments: [
          { kind: "Argument", expression: { kind: "IdentifierName", name: "value" } },
          { kind: "Argument", expression: { kind: "LiteralExpression", value: 1 } },
        ],
      },
    },
  ]);
});

test("array binding defaults emit finalized length-guarded projections", () => {
  const first = identifier("first");
  const pattern = arrayBindingPattern([
    bindingElement(first, { initializer: numericLiteral("42") }),
  ]);
  const parameter = parameterDeclaration(pattern);
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      runtimeCarriers: new Map([[parameter, { carrier: { kind: "array", element: { kind: "source-primitive", name: "int32" } } }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(statements, [{
    kind: "LocalDeclarationStatement",
    name: "first",
    type: { kind: "PredefinedType", name: "int" },
    initializer: {
      kind: "ConditionalExpression",
      condition: {
        kind: "BinaryExpression",
        left: {
          kind: "SimpleMemberAccessExpression",
          receiver: { kind: "IdentifierName", name: "value" },
          name: "Length",
        },
        operatorToken: { kind: "GreaterThanToken" },
        right: { kind: "LiteralExpression", value: 0 },
      },
      whenTrue: {
        kind: "ElementAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        argument: { kind: "LiteralExpression", value: 0 },
      },
      whenFalse: { kind: "LiteralExpression", value: 42 },
    },
  }]);
  assert.equal(diagnostics.length, 0);
});

test("object rename and rest destructuring emit from finalized object-shape facts", () => {
  const renamed = identifier("renamed");
  const rest = identifier("rest");
  const sourceMember = {
    sourceName: "source",
    targetName: "Source",
    memberKind: "property",
    type: { kind: "source-primitive", name: "int32" },
  };
  const keepMember = {
    sourceName: "keep",
    targetName: "Keep",
    memberKind: "property",
    type: { kind: "source-primitive", name: "bool" },
  };
  const sourceShape = {
    targetType: {
      kind: "target-named",
      id: "__SourceShape",
      csharpRender: { kind: "named", name: "__SourceShape" },
    },
    members: [sourceMember, keepMember],
  };
  const restShape = {
    targetType: {
      kind: "target-named",
      id: "__RestShape",
      csharpRender: { kind: "named", name: "__RestShape" },
    },
    members: [keepMember],
  };
  const pattern = objectBindingPattern([
    bindingElement(renamed, { propertyName: identifier("source") }),
    bindingElement(rest, { rest: true }),
  ]);
  const parameter = parameterDeclaration(pattern);
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      objectShapes: new Map([
        [parameter, sourceShape],
        [rest, restShape],
      ]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(statements, [
    {
      kind: "LocalDeclarationStatement",
      name: "renamed",
      type: { kind: "PredefinedType", name: "int" },
      initializer: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        name: "Source",
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "rest",
      type: { kind: "IdentifierName", name: "__RestShape" },
      initializer: {
        kind: "ObjectCreationExpression",
        type: { kind: "IdentifierName", name: "__RestShape" },
        assignments: [{
          kind: "AssignmentExpression",
          name: "Keep",
          expression: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: "value" },
            name: "Keep",
          },
        }],
      },
    },
  ]);
});

test("object rest destructuring rejects rest shape facts that retain extracted members", () => {
  const renamed = identifier("renamed");
  const rest = identifier("rest");
  const sourceMember = {
    sourceName: "source",
    targetName: "Source",
    memberKind: "property",
    type: { kind: "source-primitive", name: "int32" },
  };
  const keepMember = {
    sourceName: "keep",
    targetName: "Keep",
    memberKind: "property",
    type: { kind: "source-primitive", name: "bool" },
  };
  const sourceShape = {
    targetType: {
      kind: "target-named",
      id: "__SourceShape",
      csharpRender: { kind: "named", name: "__SourceShape" },
    },
    members: [sourceMember, keepMember],
  };
  const restShape = {
    targetType: {
      kind: "target-named",
      id: "__RestShape",
      csharpRender: { kind: "named", name: "__RestShape" },
    },
    members: [sourceMember, keepMember],
  };
  const pattern = objectBindingPattern([
    bindingElement(renamed, { propertyName: identifier("source") }),
    bindingElement(rest, { rest: true }),
  ]);
  const parameter = parameterDeclaration(pattern);
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      objectShapes: new Map([
        [parameter, sourceShape],
        [rest, restShape],
      ]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(statements, [{
    kind: "LocalDeclarationStatement",
    name: "renamed",
    type: { kind: "PredefinedType", name: "int" },
    initializer: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: "value" },
      name: "Source",
    },
  }]);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /rest shape must exclude explicitly extracted member 'source'/);
});

test("object destructuring defaults fail closed until undefined/default facts exist", () => {
  const count = identifier("count");
  const pattern = objectBindingPattern([
    bindingElement(count, { initializer: numericLiteral("1") }),
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
    fakeInput({ objectShapes: new Map([[parameter, objectShape]]) }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(statements, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Destructuring defaults require finalized undefined\/default-value semantics/);
});

function parameterDeclaration(name, options = {}) {
  const parameter = {
    Kind: KindParameter,
    name,
  };
  if (options.type !== undefined) {
    parameter.Type = options.type;
  }
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

function bindingElement(name, options = {}) {
  const element = {
    Kind: KindBindingElement,
    name,
  };
  if (options.propertyName !== undefined) {
    element.PropertyName = options.propertyName;
  }
  if (options.initializer !== undefined) {
    element.Initializer = options.initializer;
  }
  if (options.rest === true) {
    element.DotDotDotToken = {};
  }
  return element;
}

function identifier(text) {
  return {
    Kind: KindIdentifier,
    Text: text,
  };
}

function numericLiteral(text) {
  return {
    Kind: KindNumericLiteral,
    Text: text,
  };
}

function fakeInput(options = {}) {
  const runtimeCarriers = options.runtimeCarriers ?? new Map(
    options.runtimeCarrierSubject === undefined ? [] : [[options.runtimeCarrierSubject, options.runtimeCarrier]],
  );
  const objectShapes = options.objectShapes ?? new Map(
    options.objectShapeSubject === undefined ? [] : [[options.objectShapeSubject, options.objectShape]],
  );
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getTargetBindingFact: () => undefined,
      getFact: (subject, key) => key === csharpObjectShapeFactKey
        ? objectShapes.get(subject)
        : undefined,
      getRuntimeCarrierFact: (subject) => runtimeCarriers.get(subject),
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
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      isProjectSourceShapeForNode: () => false,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => runtimeCarrierResolution(options, runtimeCarriers, subject),
      resolveRuntimeCarrierForNode: (subject) => runtimeCarrierResolution(options, runtimeCarriers, subject),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
  };
}

function runtimeCarrierResolution(options, runtimeCarriers, subject) {
  const fact = runtimeCarriers.get(subject);
  return fact === undefined
    ? missingCarrierResolution(options.missingRuntimeCarrierReason, options.missingRuntimeCarrierEvidence)
    : resolvedCarrierResolution(fact.carrier);
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
