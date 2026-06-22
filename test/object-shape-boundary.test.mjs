import { test } from "node:test";
import assert from "node:assert/strict";
import { csharpObjectShapeFactKey } from "../dist/source/csharp-facts.js";
import { objectShapeStorageMemberName } from "../dist/backend/planner/object-shapes.js";
import { planPropertyAccessExpression } from "../dist/backend/planner/expression-target-members.js";
import { KindIdentifier, KindPropertyAccessExpression } from "../dist/backend/planner/source-ast.js";

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

function planExpression(node) {
  return { kind: "IdentifierName", name: node.Text };
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
      getTargetBindingFact: (subject) => subject !== undefined && subject === options.targetBindingSubject
        ? { target: "csharp", id: "Example.Values", sourceName: "Values", targetName: "Values", kind: "class" }
        : undefined,
      getFact: (subject, key) => subject !== undefined && subject === options.objectShapeSubject && key === csharpObjectShapeFactKey
        ? options.objectShape
        : undefined,
      getRuntimeCarrierFact: () => undefined,
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

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
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
