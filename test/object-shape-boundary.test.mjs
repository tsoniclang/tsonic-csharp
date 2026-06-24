import { test } from "node:test";
import assert from "node:assert/strict";
import { csharpObjectShapeFactKey } from "../dist/source/csharp-facts.js";
import { objectShapeStorageMemberName } from "../dist/backend/planner/object-shapes.js";
import { planObjectShapeSpreadAssignments } from "../dist/backend/planner/expression-object-literal-spread.js";
import { tryPlanRecordDictionaryLiteralWithExpectedType } from "../dist/backend/planner/expression-dictionary-literals.js";
import { planPropertyAccessExpression } from "../dist/backend/planner/expression-target-members.js";
import {
  KindFalseKeyword,
  KindIdentifier,
  KindObjectLiteralExpression,
  KindPropertyAccessExpression,
  KindPropertyAssignment,
  KindSpreadAssignment,
  KindStringLiteral,
  KindTrueKeyword,
} from "../dist/backend/planner/source-ast.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../dist/source/csharp-source-semantics/target-types.js";

test("object-shape property access lowers through finalized shape member facts", () => {
  const sourceFile = {};
  const receiver = identifier("shape");
  const access = propertyAccess(receiver, "count");
  const objectShape = {
    targetType: { kind: "target-named", id: "__Shape" },
    members: [{
      sourceName: "count",
      targetName: "Count",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    sourceFile,
    fakeInput({ objectShapeSubject: receiver, objectShape }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(planned, {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "shape" },
    name: "Count",
  });
  assert.deepEqual(diagnostics, []);
});

test("object-shape property access diagnoses missing finalized member evidence", () => {
  const receiver = identifier("shape");
  const access = propertyAccess(receiver, "add");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      objectShapeSubject: receiver,
      objectShape: {
        targetType: { kind: "target-named", id: "__Shape" },
        members: [{
          sourceName: "count",
          targetName: "Count",
          memberKind: "property",
          type: { kind: "source-primitive", name: "int32" },
        }],
      },
    }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(planned, { kind: "InvalidExpression", reason: "missing object-shape member fact" });
  assert.match(diagnostics[0].message, /must match a finalized object-shape member/);
});

test("provider-owned property access without selected operation facts fails closed", () => {
  const receiver = identifier("values");
  const access = propertyAccess(receiver, "add");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({ targetBindingSubject: receiver }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(planned, { kind: "InvalidExpression", reason: "missing target property fact" });
  assert.match(diagnostics[0].message, /must be selected by TSTS\/provider facts before emission/);
});

test("object-shape method storage names require exact member identity", () => {
  const member = {
    sourceName: "run",
    targetName: "Run",
    memberKind: "method",
    type: { kind: "source-primitive", name: "int32" },
  };
  const shape = {
    targetType: { kind: "target-named", id: "__Shape" },
    members: [member],
  };

  assert.equal(objectShapeStorageMemberName(shape, member), "__tsonic_shape_method_0_Run");
  assert.throws(
    () => objectShapeStorageMemberName(shape, { ...member }),
    /must belong to its object-shape fact/,
  );
});

test("record dictionary object literals lower through explicit nested Record carriers", () => {
  const sourceFile = {};
  const nestedLiteral = objectLiteral([
    propertyAssignment(identifier("password"), trueKeyword()),
    propertyAssignment(identifier("dev"), trueKeyword()),
    propertyAssignment(stringLiteral("openid connect"), falseKeyword()),
  ]);
  const rootLiteral = objectLiteral([
    propertyAssignment(identifier("authentication_methods"), nestedLiteral),
  ]);
  const innerDictionary = recordDictionaryType(csharpStringTargetType(), { kind: "source-primitive", name: "bool" });
  const outerDictionary = recordDictionaryType(csharpStringTargetType(), innerDictionary);
  const diagnostics = [];

  const planned = tryPlanRecordDictionaryLiteralWithExpectedType(
    rootLiteral,
    sourceFile,
    fakeInput({ runtimeCarriers: new Map([[rootLiteral, outerDictionary]]) }),
    diagnostics,
    rootLiteral,
    planExpectedExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "ObjectCreationExpression",
    type: dictionaryTypeNode(
      { kind: "PredefinedType", name: "string" },
      dictionaryTypeNode({ kind: "PredefinedType", name: "string" }, { kind: "PredefinedType", name: "bool" }),
    ),
    collectionInitializers: [{
      kind: "IndexerInitializer",
      arguments: [{ kind: "LiteralExpression", value: "authentication_methods" }],
      expression: {
        kind: "ObjectCreationExpression",
        type: dictionaryTypeNode({ kind: "PredefinedType", name: "string" }, { kind: "PredefinedType", name: "bool" }),
        collectionInitializers: [
          {
            kind: "IndexerInitializer",
            arguments: [{ kind: "LiteralExpression", value: "password" }],
            expression: { kind: "LiteralExpression", value: true },
          },
          {
            kind: "IndexerInitializer",
            arguments: [{ kind: "LiteralExpression", value: "dev" }],
            expression: { kind: "LiteralExpression", value: true },
          },
          {
            kind: "IndexerInitializer",
            arguments: [{ kind: "LiteralExpression", value: "openid connect" }],
            expression: { kind: "LiteralExpression", value: false },
          },
        ],
      },
    }],
  });
});

test("object spread assignments emit only from finalized source and target object-shape facts", () => {
  const source = identifier("source");
  const spread = spreadAssignment(source);
  const countMember = {
    sourceName: "count",
    targetName: "Count",
    memberKind: "property",
    type: { kind: "source-primitive", name: "int32" },
  };
  const labelMember = {
    sourceName: "label",
    targetName: "Label",
    memberKind: "property",
    type: csharpStringTargetType(),
  };
  const sourceShape = {
    targetType: {
      kind: "target-named",
      id: "__SourceShape",
      csharpRender: { kind: "named", name: "__SourceShape" },
    },
    members: [countMember, labelMember],
  };
  const targetShape = {
    targetType: {
      kind: "target-named",
      id: "__TargetShape",
      csharpRender: { kind: "named", name: "__TargetShape" },
    },
    members: [
      { ...countMember, targetName: "TargetCount" },
      { ...labelMember, targetName: "TargetLabel" },
    ],
  };
  const diagnostics = [];

  const assignments = planObjectShapeSpreadAssignments(
    spread,
    targetShape,
    {},
    fakeInput({ objectShapes: new Map([[source, sourceShape]]) }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(assignments, [
    {
      kind: "AssignmentExpression",
      name: "TargetCount",
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "source" },
        name: "Count",
      },
    },
    {
      kind: "AssignmentExpression",
      name: "TargetLabel",
      expression: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "source" },
        name: "Label",
      },
    },
  ]);
});

test("object spread fails closed without finalized source object-shape facts", () => {
  const spread = spreadAssignment(identifier("source"));
  const diagnostics = [];

  const assignments = planObjectShapeSpreadAssignments(
    spread,
    {
      targetType: {
        kind: "target-named",
        id: "__TargetShape",
        csharpRender: { kind: "named", name: "__TargetShape" },
      },
      members: [{
        sourceName: "count",
        targetName: "Count",
        memberKind: "property",
        type: { kind: "source-primitive", name: "int32" },
      }],
    },
    {},
    fakeInput(),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(assignments, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object literal spread requires finalized provider object-shape facts/);
});

test("object spread rejects non-identifier expressions until single-evaluation facts exist", () => {
  const spread = spreadAssignment(objectLiteral([]));
  const diagnostics = [];

  const assignments = planObjectShapeSpreadAssignments(
    spread,
    {
      targetType: {
        kind: "target-named",
        id: "__TargetShape",
        csharpRender: { kind: "named", name: "__TargetShape" },
      },
      members: [],
    },
    {},
    fakeInput(),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(assignments, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a single-evaluation provider lowering/);
});

function identifier(text) {
  return { Kind: KindIdentifier, Text: text };
}

function propertyAccess(receiver, name) {
  return {
    Kind: KindPropertyAccessExpression,
    Expression: receiver,
    name: identifier(name),
  };
}

function objectLiteral(properties) {
  return {
    Kind: KindObjectLiteralExpression,
    Properties: { Nodes: properties },
  };
}

function spreadAssignment(expression) {
  return {
    Kind: KindSpreadAssignment,
    Expression: expression,
  };
}

function propertyAssignment(name, initializer) {
  return {
    Kind: KindPropertyAssignment,
    name,
    Initializer: initializer,
  };
}

function stringLiteral(text) {
  return { Kind: KindStringLiteral, Text: text };
}

function trueKeyword() {
  return { Kind: KindTrueKeyword };
}

function falseKeyword() {
  return { Kind: KindFalseKeyword };
}

function planExpression(node) {
  return { kind: "IdentifierName", name: node.Text };
}

function planExpectedExpression(node) {
  switch (node.Kind) {
    case KindTrueKeyword:
      return { kind: "LiteralExpression", value: true };
    case KindFalseKeyword:
      return { kind: "LiteralExpression", value: false };
    case KindIdentifier:
      return { kind: "IdentifierName", name: node.Text };
    default:
      throw new Error(`Unsupported expected expression fixture node ${node.Kind}`);
  }
}

function fakeInput(options = {}) {
  const runtimeCarriers = options.runtimeCarriers ?? new Map();
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
      getTargetBindingFact: (subject) => subject !== undefined && subject === options.targetBindingSubject
        ? { target: "csharp", id: "Example.Values", sourceName: "Values", targetName: "Values", kind: "class" }
        : undefined,
      getFact: (subject, key) => key === csharpObjectShapeFactKey
        ? objectShapes.get(subject)
        : undefined,
      getRuntimeCarrierFact: (subject) => {
        const carrier = runtimeCarriers.get(subject);
        return carrier === undefined ? undefined : { carrier };
      },
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

function recordDictionaryType(keyType, valueType) {
  return {
    ...csharpTargetNamedType("System.Collections.Generic.Dictionary`2", [keyType, valueType], csharpQualifiedTypeRenderShape("System.Collections.Generic", "Dictionary")),
    csharpCollectionSurface: "record",
  };
}

function dictionaryTypeNode(keyType, valueType) {
  return {
    kind: "QualifiedName",
    left: {
      kind: "QualifiedName",
      left: {
        kind: "QualifiedName",
        left: { kind: "IdentifierName", name: "System" },
        name: "Collections",
      },
      name: "Generic",
    },
    name: "Dictionary",
    typeArguments: [keyType, valueType],
  };
}

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
