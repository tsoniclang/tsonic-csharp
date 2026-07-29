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
test("tuple parameter destructuring emits Item projections from finalized tuple carrier facts", () => {
  const sourceExample = `
    declare const value: [number, boolean];
    const [count, enabled] = value;
  `;
  assert.match(sourceExample, /\[count, enabled\]/);

  const count = identifier("count");
  const enabled = identifier("enabled");
  const pattern = arrayBindingPattern([
    bindingElement(count),
    bindingElement(enabled),
  ]);
  const parameter = parameterDeclaration(pattern);
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      runtimeCarriers: new Map([[parameter, { carrier: { kind: "tuple", elements: [int32Type(), { kind: "source-primitive", name: "bool" }] } }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(statements, [
    {
      kind: "LocalDeclarationStatement",
      name: "count",
      type: { kind: "PredefinedType", name: "int" },
      initializer: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        name: "Item1",
      },
    },
    {
      kind: "LocalDeclarationStatement",
      name: "enabled",
      type: { kind: "PredefinedType", name: "bool" },
      initializer: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "value" },
        name: "Item2",
      },
    },
  ]);
});
test("tuple destructuring defaults fail closed without optional-element facts", () => {
  const sourceExample = `
    declare const value: [number?];
    const [count = 1] = value;
  `;
  assert.match(sourceExample, /count = 1/);

  const pattern = arrayBindingPattern([
    bindingElement(identifier("count"), { initializer: numericLiteral("1") }),
  ]);
  const parameter = parameterDeclaration(pattern);
  const diagnostics = [];

  const statements = planParameterBindingPrelude(
    pattern,
    "value",
    sourceFile,
    fakeInput({
      runtimeCarriers: new Map([[parameter, { carrier: { kind: "tuple", elements: [csharpNullableValueTargetType(int32Type())] } }]]),
    }),
    diagnostics,
    createDestructuringPlannerState(),
  );

  assert.deepEqual(statements, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Tuple destructuring defaults for optional\/nullish tuple elements require finalized tuple optional-element facts/);
});
