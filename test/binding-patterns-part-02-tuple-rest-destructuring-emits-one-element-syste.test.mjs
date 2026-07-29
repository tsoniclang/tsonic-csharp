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
  planParametersWithPrelude,
} from "../dist/backend/planner/parameters.js";
import {
  csharpObjectShapeFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpListTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpReadOnlyListTargetType,
  csharpTargetNamedType,
} from "../dist/policy/types/index.js";
import {
  csharpJsArrayCarrierTargetType,
} from "../dist/policy/types/index.js";
import {
  KindArrayBindingPattern,
  KindBindingElement,
  KindIdentifier,
  KindNumericLiteral,
  KindObjectBindingPattern,
  KindParameter,
  KindTypeLiteral,
} from "../dist/backend/planner/source-ast.js";
























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

function int32Type() {
  return { kind: "source-primitive", name: "int32" };
}

function providerReadOnlyIndexableTargetType(elementType) {
  return csharpTargetNamedType(
    "Example.ProviderReadOnlyIndexable`1",
    [elementType],
    csharpQualifiedTypeRenderShape("Example", "ProviderReadOnlyIndexable"),
    { readOnlyIndexableElementType: elementType },
  );
}

function providerArrayLiteralOnlyTargetType(elementType) {
  return csharpTargetNamedType(
    "Example.ProviderLiteralOnly`1",
    [elementType],
    csharpQualifiedTypeRenderShape("Example", "ProviderLiteralOnly"),
    { arrayLiteralElementType: elementType, arrayLiteralConstructionType: csharpListTargetType(elementType) },
  );
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  getSourceFile: () => sourceFile,
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

test("tuple rest destructuring emits one-element System.ValueTuple from finalized carrier facts", () => {
  const sourceExample = `
    declare const value: [number, number];
    const [first, ...rest] = value;
  `;
  assert.match(sourceExample, /\.\.\.rest/);

  const pattern = arrayBindingPattern([
    bindingElement(identifier("first")),
    bindingElement(identifier("rest"), { rest: true }),
  ]);
  const parameter = parameterDeclaration(pattern);
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      runtimeCarriers: new Map([[parameter, { carrier: { kind: "tuple", elements: [int32Type(), int32Type()] } }]]),
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
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        name: "Item1",
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "rest",
      type: {
        kind: "QualifiedName",
        left: { kind: "IdentifierName", name: "System" },
        name: "ValueTuple",
        typeArguments: [{ kind: "PredefinedType", name: "int" }],
      },
      initializer: {
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
            receiver: { kind: "IdentifierName", name: "value" },
            name: "Item2",
          },
        }],
      },
    },
  ]);
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
test("JSArray binding defaults use finalized hole-presence checks", () => {
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
      runtimeCarriers: new Map([[parameter, { carrier: csharpJsArrayCarrierTargetType({ kind: "source-primitive", name: "int32" }) }]]),
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
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: { kind: "IdentifierName", name: "value" },
          name: "hasIndex",
        },
        arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: 0 } }],
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
test("destructured parameters allocate synthetic parameters and emit fixed rest default prelude from facts", () => {
  const sourceExample = `
    export function sum([first = 42, second, ...rest]: number[]): number {
      return first + second + rest.length;
    }
  `;
  assert.match(sourceExample, /\[first = 42, second, \.\.\.rest\]/);

  const first = identifier("first");
  const second = identifier("second");
  const rest = identifier("rest");
  const pattern = arrayBindingPattern([
    bindingElement(first, { initializer: numericLiteral("42") }),
    bindingElement(second),
    bindingElement(rest, { rest: true }),
  ]);
  const parameter = parameterDeclaration(pattern);
  const sourceCarrier = { kind: "array", element: { kind: "source-primitive", name: "int32" } };
  const diagnostics = [];

  const planned = planParametersWithPrelude(
    [parameter],
    sourceFile,
    fakeInput({
      runtimeCarriers: new Map([
        [pattern, { carrier: sourceCarrier }],
        [parameter, { carrier: sourceCarrier }],
      ]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned.parameters, [{
    name: "__tsonic_param0",
    type: { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } },
    attributes: undefined,
  }]);
  assert.deepEqual(planned.prelude, [
    {
      kind: "LocalDeclarationStatement",
      name: "first",
      type: { kind: "PredefinedType", name: "int" },
      initializer: {
        kind: "ConditionalExpression",
        condition: {
          kind: "BinaryExpression",
          left: {
            kind: "SimpleMemberAccessExpression",
            receiver: { kind: "IdentifierName", name: "__tsonic_param0" },
            name: "Length",
          },
          operatorToken: { kind: "GreaterThanToken" },
          right: { kind: "LiteralExpression", value: 0 },
        },
        whenTrue: {
          kind: "ElementAccessExpression",
          receiver: { kind: "IdentifierName", name: "__tsonic_param0" },
          argument: { kind: "LiteralExpression", value: 0 },
        },
        whenFalse: { kind: "LiteralExpression", value: 42 },
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "second",
      type: { kind: "PredefinedType", name: "int" },
      initializer: {
        kind: "ElementAccessExpression",
        receiver: { kind: "IdentifierName", name: "__tsonic_param0" },
        argument: { kind: "LiteralExpression", value: 1 },
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "rest",
      type: { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } },
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
          { kind: "Argument", expression: { kind: "IdentifierName", name: "__tsonic_param0" } },
          { kind: "Argument", expression: { kind: "LiteralExpression", value: 2 } },
        ],
      },
    },
  ]);
});
test("array destructuring over finalized read-only collection carriers emits Count and slice helper projections", () => {
  const first = identifier("first");
  const rest = identifier("rest");
  const pattern = arrayBindingPattern([
    bindingElement(first, { initializer: numericLiteral("7") }),
    bindingElement(rest, { rest: true }),
  ]);
  const parameter = parameterDeclaration(pattern);
  const sourceCarrier = csharpReadOnlyListTargetType(int32Type());
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      runtimeCarriers: new Map([[parameter, { carrier: sourceCarrier }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.equal(statements.length, 2);
  assert.deepEqual(statements[0].initializer, {
    kind: "ConditionalExpression",
    condition: {
      kind: "BinaryExpression",
      left: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        name: "Count",
      },
      operatorToken: { kind: "GreaterThanToken" },
      right: { kind: "LiteralExpression", value: 0 },
    },
    whenTrue: {
      kind: "ElementAccessExpression",
      receiver: { kind: "IdentifierName", name: "value" },
      argument: { kind: "LiteralExpression", value: 0 },
    },
    whenFalse: { kind: "LiteralExpression", value: 7 },
  });
  assert.deepEqual(statements[1].initializer, {
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
      { kind: "Argument", expression: { kind: "IdentifierName", name: "value" } },
      { kind: "Argument", expression: { kind: "LiteralExpression", value: 1 } },
    ],
  });
});
