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

test("object destructuring defaults fail closed for optional value members without nullable carrier facts", () => {
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
      type: int32Type(),
      optional: true,
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
  assert.match(diagnostics[0].message, /requires optional value-type members to carry a nullable target carrier/);
});
