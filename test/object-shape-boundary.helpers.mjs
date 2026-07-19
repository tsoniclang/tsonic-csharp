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
  beginObjectShapeSourceFilePlanning,
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
export { test, assert, missingCarrierResolution, missingParameterCarrierResolution, resolvedCarrierResolution, csharpObjectShapeFactKey, csharpTargetOperationFactKey, beginObjectShapePlanning, beginObjectShapeSourceFilePlanning, csharpTypeFromObjectShapeFact, objectShapeStorageMemberName, takeObjectShapeDeclarations, planObjectLiteralExpressionWithExpectedType, planObjectShapeSpreadAssignments, tryPlanRecordDictionaryLiteralWithExpectedType, printCsharpCompilationUnit, planElementAccessExpression, planPropertyAccessExpression, KindElementAccessExpression, KindFalseKeyword, KindGetAccessor, KindIdentifier, KindMethodDeclaration, KindNumericLiteral, KindObjectLiteralExpression, KindPropertyAccessExpression, KindPropertyAssignment, KindShorthandPropertyAssignment, KindSpreadAssignment, KindStringLiteral, KindTrueKeyword, csharpQualifiedTypeRenderShape, csharpDelegateTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType };




























export function identifier(text) {
  return { Kind: KindIdentifier, Text: text };
}

export function propertyAccess(receiver, name) {
  return {
    Kind: KindPropertyAccessExpression,
    Expression: receiver,
    name: identifier(name),
  };
}

export function elementAccess(receiver, argument) {
  return {
    Kind: KindElementAccessExpression,
    Expression: receiver,
    ArgumentExpression: argument,
  };
}

export function numericLiteral(text) {
  return {
    Kind: KindNumericLiteral,
    Text: text,
  };
}

export function binaryExpression(left, right) {
  return {
    Kind: "KindBinaryExpression",
    Left: left,
    Right: right,
  };
}

export function objectLiteral(properties) {
  return {
    Kind: KindObjectLiteralExpression,
    Properties: { Nodes: properties },
  };
}

export function shorthandPropertyAssignment(name) {
  return {
    Kind: KindShorthandPropertyAssignment,
    name,
  };
}

export function spreadAssignment(expression) {
  return {
    Kind: KindSpreadAssignment,
    Expression: expression,
  };
}

export function propertyAssignment(name, initializer) {
  return {
    Kind: KindPropertyAssignment,
    name,
    Initializer: initializer,
  };
}

export function getAccessor(name) {
  return {
    Kind: KindGetAccessor,
    name,
  };
}

export function methodDeclaration(name, options = {}) {
  return {
    Kind: KindMethodDeclaration,
    name,
    TypeParameters: { Nodes: options.typeParameters ?? [] },
    Parameters: { Nodes: options.parameters ?? [] },
    Body: options.body,
  };
}

export function parameter(name) {
  return {
    Kind: "KindParameter",
    name,
  };
}

export function block(statements) {
  return {
    Kind: "KindBlock",
    Statements: { Nodes: statements },
  };
}

export function stringLiteral(text) {
  return { Kind: KindStringLiteral, Text: text };
}

export function sourceFileNode(fileName, text) {
  return {
    Kind: "KindSourceFile",
    Statements: { Nodes: [] },
    FileName: () => fileName,
    Text: () => text,
    Loc: { pos: 0, end: text.length },
  };
}

export function attachSourceFile(sourceFile, root) {
  sourceFile.Statements = { Nodes: [root] };
  setParentRecursive(root, sourceFile);
}

export function setParentRecursive(subject, parent) {
  if (subject === undefined || subject === null || typeof subject !== "object") {
    return;
  }
  subject.Parent = parent;
  for (const child of childNodes(subject)) {
    setParentRecursive(child, subject);
  }
}

export function childNodes(subject) {
  return [
    ...(subject.Properties?.Nodes ?? []),
    ...(subject.Elements?.Nodes ?? []),
    subject.Expression,
    subject.Initializer,
    subject.name,
    subject.Left,
    subject.Right,
    subject.ArgumentExpression,
  ].filter((child) => child !== undefined);
}

export function span(text, token) {
  const pos = text.indexOf(token);
  assert.notEqual(pos, -1, `missing token '${token}'`);
  return { pos, end: pos + token.length };
}

export function trueKeyword() {
  return { Kind: KindTrueKeyword };
}

export function falseKeyword() {
  return { Kind: KindFalseKeyword };
}

export function planExpression(node) {
  if (node.Kind === KindNumericLiteral) {
    return { kind: "LiteralExpression", value: Number(node.Text) };
  }
  return { kind: "IdentifierName", name: node.Text };
}

export function planExpectedExpression(node) {
  switch (node.Kind) {
    case KindTrueKeyword:
      return { kind: "LiteralExpression", value: true };
    case KindFalseKeyword:
      return { kind: "LiteralExpression", value: false };
    case KindNumericLiteral:
      return { kind: "LiteralExpression", value: Number(node.Text) };
    case KindIdentifier:
      return { kind: "IdentifierName", name: node.Text };
    default:
      throw new Error(`Unsupported expected expression fixture node ${node.Kind}`);
  }
}

export function fakeInput(options = {}) {
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
    types: {
      getConstantValue: (subject) => options.constantValues?.get(subject),
      isNumberLike: () => false,
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getTypeAtLocation: (subject) => options.nodeTypes?.get(subject),
      getTypeFromTypeNode: () => undefined,
      isProjectSourceShapeForNode: () => false,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => resolvedCarrierResolution(runtimeCarriers.get(subject)),
      resolveRuntimeCarrierForNode: (subject) => resolvedCarrierResolution(runtimeCarriers.get(subject)),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
  };
}

export function targetOperation(operationId, operationKind) {
  return {
    operationId,
    operationKind,
    targetOperation: operationId,
  };
}

export function csharpMemberOperation(operationId, operationKind, memberName) {
  return {
    kind: "member",
    operationId,
    operationKind,
    memberName,
    declaringType: csharpTargetNamedType("Example.Values", undefined, csharpQualifiedTypeRenderShape("Example", "Values")),
    resultType: csharpSourcePrimitiveTargetType("int32"),
  };
}

export function recordDictionaryType(keyType, valueType) {
  return {
    ...csharpTargetNamedType("System.Collections.Generic.Dictionary`2", [keyType, valueType], csharpQualifiedTypeRenderShape("System.Collections.Generic", "Dictionary")),
    csharpCollectionSurface: "record",
  };
}

export function dictionaryTypeNode(keyType, valueType) {
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

export const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  name: (node) => node?.name,
  text: (node) => String(node?.Text ?? ""),
  parent: (node) => node?.Parent,
  children: (node) => node?.Children ?? node?.Types ?? [],
  typeArguments: (node) => node?.TypeArguments?.Nodes ?? [],
  is: new Proxy({
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
  }, {
    get(target, property) {
      return property in target ? target[property] : () => false;
    },
  }),
};
