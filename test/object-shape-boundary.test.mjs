import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import {
  csharpObjectShapeFactKey,
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  beginObjectShapePlanning,
  csharpTypeFromObjectShapeFact,
  objectShapeStorageMemberName,
  takeObjectShapeDeclarations,
} from "../dist/backend/planner/object-shapes.js";
import { planObjectLiteralExpressionWithExpectedType } from "../dist/backend/planner/expression-object-literals.js";
import { planObjectShapeSpreadAssignments } from "../dist/backend/planner/expression-object-literal-spread.js";
import { tryPlanRecordDictionaryLiteralWithExpectedType } from "../dist/backend/planner/expression-dictionary-literals.js";
import { printCsharpCompilationUnit } from "../dist/print/csharp-printer.js";
import {
  planElementAccessExpression,
  planPropertyAccessExpression,
} from "../dist/backend/planner/expression-target-members/index.js";
import {
  KindElementAccessExpression,
  KindFalseKeyword,
  KindGetAccessor,
  KindIdentifier,
  KindMethodDeclaration,
  KindNumericLiteral,
  KindObjectLiteralExpression,
  KindPropertyAccessExpression,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindStringLiteral,
  KindTrueKeyword,
} from "../dist/backend/planner/source-ast.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpDelegateTargetType,
  csharpSourcePrimitiveTargetType,
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

  assert.equal(planned, undefined);
  assert.match(diagnostics[0].message, /must match a finalized object-shape member/);
});

test("object-shape property access diagnoses ambiguous finalized member evidence", () => {
  const receiver = identifier("shape");
  const access = propertyAccess(receiver, "count");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      objectShapeSubject: receiver,
      objectShape: {
        targetType: { kind: "target-named", id: "__Shape" },
        members: [
          {
            sourceName: "count",
            targetName: "Count",
            memberKind: "property",
            type: { kind: "source-primitive", name: "int32" },
          },
          {
            sourceName: "count",
            targetName: "DuplicateCount",
            memberKind: "property",
            type: { kind: "source-primitive", name: "int32" },
          },
        ],
      },
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.match(diagnostics[0].message, /matched multiple finalized object-shape members/);
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

  assert.equal(planned, undefined);
  assert.match(diagnostics[0].message, /must be selected by TSTS\/provider facts before emission/);
});

test("provider-owned property access emits from finalized selected member fact, not source spelling", () => {
  const receiver = identifier("values");
  const access = propertyAccess(receiver, "sourceSpellingMustNotPickTarget");
  const diagnostics = [];
  const operationId = "Example.Values.Actual";

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      selectedPropertySubject: access,
      selectedProperty: targetOperation(operationId, "property"),
      csharpOperationSubject: access,
      csharpOperation: csharpMemberOperation(operationId, "property", "Actual"),
    }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "values" },
    name: "Actual",
  });
});

test("provider-owned property access rejects generic selected fact without C# operation fact", () => {
  const receiver = identifier("values");
  const access = propertyAccess(receiver, "actual");
  const diagnostics = [];

  const planned = planPropertyAccessExpression(
    access,
    {},
    fakeInput({
      selectedPropertySubject: access,
      selectedProperty: targetOperation("Example.Values.Actual", "property"),
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a finalized C# target operation fact/);
  assert.match(diagnostics[0].message, /generic TSTS target operation 'Example\.Values\.Actual' is not enough/);
});

test("provider-owned element access emits only from finalized selected indexer facts", () => {
  const receiver = identifier("values");
  const access = elementAccess(receiver, numericLiteral("0"));
  const diagnostics = [];
  const operationId = "Example.Values.Item(System.Int32)";

  const planned = planElementAccessExpression(
    access,
    {},
    fakeInput({
      selectedElementSubject: access,
      selectedElement: targetOperation(operationId, "indexer"),
      csharpOperationSubject: access,
      csharpOperation: csharpMemberOperation(operationId, "indexer", "Item"),
    }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "ElementAccessExpression",
    receiver: { kind: "IdentifierName", name: "values" },
    argument: { kind: "LiteralExpression", value: 0 },
  });
});

test("provider-owned element access rejects generic selected indexer without C# operation fact", () => {
  const receiver = identifier("values");
  const access = elementAccess(receiver, numericLiteral("0"));
  const diagnostics = [];

  const planned = planElementAccessExpression(
    access,
    {},
    fakeInput({
      selectedElementSubject: access,
      selectedElement: targetOperation("Example.Values.Item(System.Int32)", "indexer"),
    }),
    diagnostics,
    planExpression,
  );

  assert.equal(planned, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /requires a finalized C# target operation fact/);
});

test("tuple element access emits Roslyn member access only from numeric-literal source indexes", () => {
  const receiver = identifier("pair");
  const access = elementAccess(receiver, numericLiteral("1"));
  const diagnostics = [];

  const planned = planElementAccessExpression(
    access,
    {},
    fakeInput({
      runtimeCarriers: new Map([[receiver, {
        kind: "tuple",
        elements: [
          csharpSourcePrimitiveTargetType("int32"),
          csharpStringTargetType(),
        ],
      }]]),
    }),
    diagnostics,
    planExpression,
  );

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "SimpleMemberAccessExpression",
    receiver: { kind: "IdentifierName", name: "pair" },
    name: "Item2",
  });
});

test("tuple element access fails closed instead of reading semantic type strings", () => {
  const receiver = identifier("pair");
  const index = identifier("index");
  const access = elementAccess(receiver, index);
  const diagnostics = [];
  const input = fakeInput({
    runtimeCarriers: new Map([[receiver, {
      kind: "tuple",
      elements: [csharpSourcePrimitiveTargetType("int32")],
    }]]),
  });
  input.analysis.getTypeAtLocation = () => {
    throw new Error("tuple element planning must not inspect semantic type strings");
  };

  const planned = planElementAccessExpression(access, {}, input, diagnostics, planExpression);

  assert.equal(planned, undefined);
  assert.match(diagnostics[0].message, /numeric-literal source index/);
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

test("generated structural carriers close over finalized type-parameter target arguments", () => {
  const sourceExample = `
    type Box<T> = { value: T };

    export function create<T>(value: T): Box<T> {
      return { value };
    }
  `;
  assert.match(sourceExample, /Box<T>/);
  assert.match(sourceExample, /return \{ value \}/);

  const typeParameter = { kind: "type-parameter", name: "T" };
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__TsonicShape_Generic",
      typeArguments: [typeParameter],
      csharpRender: { kind: "named", name: "__TsonicShape_Generic" },
    },
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: typeParameter,
    }],
  };
  const literal = objectLiteral([
    shorthandPropertyAssignment(identifier("value")),
  ]);
  const input = fakeInput({ objectShapes: new Map([[literal, shape]]) });
  const diagnostics = [];

  beginObjectShapePlanning(input);
  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    input,
    diagnostics,
    { kind: "IdentifierName", name: "__TsonicShape_Generic", typeArguments: [{ kind: "IdentifierName", name: "T" }] },
    undefined,
    planExpression,
    planExpectedExpression,
  );
  const declarations = takeObjectShapeDeclarations(input);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: declarations,
  });

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned, {
    kind: "ObjectCreationExpression",
    type: { kind: "IdentifierName", name: "__TsonicShape_Generic", typeArguments: [{ kind: "IdentifierName", name: "T" }] },
    assignments: [{
      kind: "AssignmentExpression",
      name: "value",
      expression: { kind: "IdentifierName", name: "value" },
    }],
  });
  assert.match(printed, /public class __TsonicShape_Generic<T>/);
  assert.match(printed, /public T value;/);
});

test("generated structural carriers fail closed when type-parameter facts are not declared on the carrier", () => {
  const sourceExample = `
    type Box<T> = { value: T };

    export function create<T>(value: T): Box<T> {
      return { value };
    }
  `;
  assert.match(sourceExample, /value: T/);

  const input = fakeInput();
  const diagnostics = [];

  beginObjectShapePlanning(input);
  const renderedType = csharpTypeFromObjectShapeFact(
    input,
    {
      targetType: {
        kind: "target-named",
        id: "__TsonicShape_OpenButUndeclared",
        csharpRender: { kind: "named", name: "__TsonicShape_OpenButUndeclared" },
      },
      members: [{
        sourceName: "value",
        targetName: "value",
        memberKind: "property",
        type: { kind: "type-parameter", name: "T" },
      }],
    },
    diagnostics,
    identifier("shape"),
  );
  const declarations = takeObjectShapeDeclarations(input);

  assert.deepEqual(renderedType, { kind: "IdentifierName", name: "__TsonicShape_OpenButUndeclared" });
  assert.deepEqual(declarations, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /uses type parameter 'T' without declaring it/);
});

test("object-shape object literals fail closed for computed property names", () => {
  const literal = objectLiteral([
    propertyAssignment(binaryExpression(identifier("prefix"), identifier("suffix")), numericLiteral("1")),
  ]);
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const diagnostics = [];

  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    fakeInput({ objectShapes: new Map([[literal, shape]]) }),
    diagnostics,
    { kind: "IdentifierName", name: "__Shape" },
    undefined,
    planExpression,
    planExpectedExpression,
  );

  assert.deepEqual(planned.assignments, []);
  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0].message, /require identifier or string-literal property names/);
  assert.match(diagnostics[1].message, /must match a finalized provider object-shape member/);
});

test("object-shape object literals fail closed for accessors", () => {
  const literal = objectLiteral([
    getAccessor(identifier("value")),
  ]);
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "int32" },
    }],
  };
  const diagnostics = [];

  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    fakeInput({ objectShapes: new Map([[literal, shape]]) }),
    diagnostics,
    { kind: "IdentifierName", name: "__Shape" },
    undefined,
    planExpression,
    planExpectedExpression,
  );

  assert.deepEqual(planned.assignments, []);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object literal member is outside the current C# planning surface/);
});

test("object-shape object literals fail closed for generic methods", () => {
  const method = methodDeclaration(identifier("map"), {
    typeParameters: [identifier("T")],
    parameters: [parameter(identifier("value"))],
    body: block([]),
  });
  const literal = objectLiteral([method]);
  const shape = {
    targetType: {
      kind: "target-named",
      id: "__Shape",
      csharpRender: { kind: "named", name: "__Shape" },
    },
    members: [{
      sourceName: "map",
      targetName: "map",
      memberKind: "method",
      type: csharpDelegateTargetType("System.Func", [{ kind: "source-primitive", name: "int32" }], { kind: "source-primitive", name: "int32" }),
    }],
  };
  const diagnostics = [];

  const planned = planObjectLiteralExpressionWithExpectedType(
    literal,
    {},
    fakeInput({ objectShapes: new Map([[literal, shape]]) }),
    diagnostics,
    { kind: "IdentifierName", name: "__Shape" },
    undefined,
    planExpression,
    planExpectedExpression,
  );

  assert.equal(planned.assignments.length, 0);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Object literal generic methods require finalized target delegate facts/);
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

function elementAccess(receiver, argument) {
  return {
    Kind: KindElementAccessExpression,
    Expression: receiver,
    ArgumentExpression: argument,
  };
}

function numericLiteral(text) {
  return {
    Kind: KindNumericLiteral,
    Text: text,
  };
}

function binaryExpression(left, right) {
  return {
    Kind: "KindBinaryExpression",
    Left: left,
    Right: right,
  };
}

function objectLiteral(properties) {
  return {
    Kind: KindObjectLiteralExpression,
    Properties: { Nodes: properties },
  };
}

function shorthandPropertyAssignment(name) {
  return {
    Kind: KindShorthandPropertyAssignment,
    name,
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

function getAccessor(name) {
  return {
    Kind: KindGetAccessor,
    name,
  };
}

function methodDeclaration(name, options = {}) {
  return {
    Kind: KindMethodDeclaration,
    name,
    TypeParameters: { Nodes: options.typeParameters ?? [] },
    Parameters: { Nodes: options.parameters ?? [] },
    Body: options.body,
  };
}

function parameter(name) {
  return {
    Kind: "KindParameter",
    name,
  };
}

function block(statements) {
  return {
    Kind: "KindBlock",
    Statements: { Nodes: statements },
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
  if (node.Kind === KindNumericLiteral) {
    return { kind: "LiteralExpression", value: Number(node.Text) };
  }
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
      getSelectedTargetProperty: (subject) => subject === options.selectedPropertySubject
        ? options.selectedProperty
        : undefined,
      getSelectedTargetElementAccess: (subject) => subject === options.selectedElementSubject
        ? options.selectedElement
        : undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getTargetBindingFact: (subject) => subject !== undefined && subject === options.targetBindingSubject
        ? { target: "csharp", id: "Example.Values", sourceName: "Values", targetName: "Values", kind: "class" }
        : undefined,
      getFact: (subject, key) => {
        if (key === csharpObjectShapeFactKey) {
          return objectShapes.get(subject);
        }
        if (key === csharpTargetOperationFactKey && subject === options.csharpOperationSubject) {
          return options.csharpOperation;
        }
        return undefined;
      },
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
      resolveRuntimeCarrier: (subject) => resolvedCarrierResolution(runtimeCarriers.get(subject)?.carrier),
      resolveRuntimeCarrierForNode: (subject) => resolvedCarrierResolution(runtimeCarriers.get(subject)?.carrier),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
  };
}

function targetOperation(operationId, operationKind) {
  return {
    operationId,
    operationKind,
    targetOperation: operationId,
  };
}

function csharpMemberOperation(operationId, operationKind, memberName) {
  return {
    kind: "member",
    operationId,
    operationKind,
    memberName,
    declaringType: csharpTargetNamedType("Example.Values"),
    resultType: csharpSourcePrimitiveTargetType("int32"),
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
