import {
  AsObjectLiteralExpression,
  AsPropertyAssignment,
  AsShorthandPropertyAssignment,
  HasSourceKind,
  KindIdentifier,
  KindMethodDeclaration,
  KindNumericLiteral,
  KindObjectLiteralExpression,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  KindStringLiteral,
  Node_Name,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpCollectionInitializerElement,
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  isCsharpRecordDictionaryTargetType,
} from "../../source/csharp-source-semantics/dictionaries.js";
import {
  isCsharpStringType,
  sourcePrimitiveRuntimeKind,
} from "../../source/csharp-source-semantics/target-rules.js";
import {
  parseFiniteNumberLiteral,
} from "../../source/source-literal-values.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  invalidExpression,
} from "./invalid-expression.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

type ExpectedExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
) => CsharpExpression;

export function tryPlanRecordDictionaryLiteralWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedTypeSubject: Node | undefined,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindObjectLiteralExpression)) {
    return undefined;
  }
  const dictionaryType = getExpectedRecordDictionaryTargetType(node, expectedTypeSubject, sourceFile, input);
  if (dictionaryType === undefined) {
    return undefined;
  }
  return planRecordDictionaryLiteral(node, sourceFile, input, diagnostics, dictionaryType, planExpressionWithExpectedType);
}

function planRecordDictionaryLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  dictionaryType: TargetTypeRef,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression {
  const properties = (AsObjectLiteralExpression(node)!.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined);
  const type = csharpTypeFromTargetTypeRef(dictionaryType);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Record dictionary object literal emission requires a renderable provider-owned Dictionary target type."));
    return invalidExpression("unrenderable Record dictionary target type");
  }
  if (properties.length === 0) {
    return {
      kind: "ObjectCreationExpression",
      type,
      arguments: [],
    };
  }
  const [keyType, valueType] = dictionaryType.kind === "target-named" ? dictionaryType.typeArguments ?? [] : [];
  if (keyType === undefined || valueType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Record dictionary object literal emission requires finalized key and value target type facts before C# emission."));
    return invalidExpression("record dictionary literal without key/value target facts");
  }
  const valueCsharpType = csharpTypeFromTargetTypeRef(valueType);
  if (valueCsharpType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Record dictionary object literal values require a renderable finalized value target type before C# emission."));
    return invalidExpression("record dictionary literal without renderable value type");
  }
  const collectionInitializers = properties
    .map((property) => planRecordDictionaryInitializer(property, keyType, valueType, valueCsharpType, sourceFile, input, diagnostics, planExpressionWithExpectedType))
    .filter((initializer): initializer is CsharpCollectionInitializerElement => initializer !== undefined);
  if (collectionInitializers.length !== properties.length) {
    return invalidExpression("record dictionary literal with unsupported member");
  }
  return {
    kind: "ObjectCreationExpression",
    type,
    collectionInitializers,
  };
}

function planRecordDictionaryInitializer(
  property: Node,
  keyType: TargetTypeRef,
  valueType: TargetTypeRef,
  valueCsharpType: CsharpTypeNode,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpCollectionInitializerElement | undefined {
  switch (SourceKind(input.ast, property)) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(property)!;
      if (propertyAssignment.Initializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary property assignment must have an initializer."));
        return undefined;
      }
      const key = planRecordDictionaryKey(property, keyType, input, diagnostics);
      if (key === undefined) {
        return undefined;
      }
      return {
        kind: "IndexerInitializer",
        arguments: [key],
        expression: planRecordDictionaryValue(propertyAssignment.Initializer, valueType, valueCsharpType, sourceFile, input, diagnostics, planExpressionWithExpectedType),
      };
    }
    case KindShorthandPropertyAssignment: {
      const shorthand = AsShorthandPropertyAssignment(property)!;
      if (shorthand.ObjectAssignmentInitializer !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary shorthand defaults require finalized default-value semantics before C# emission."));
        return undefined;
      }
      const key = planRecordDictionaryKey(property, keyType, input, diagnostics);
      const nameNode = Node_Name(property);
      if (key === undefined || nameNode === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary shorthand must carry a finalized source name and value carrier before C# emission."));
        return undefined;
      }
      return {
        kind: "IndexerInitializer",
        arguments: [key],
        expression: planRecordDictionaryValue(nameNode, valueType, valueCsharpType, sourceFile, input, diagnostics, planExpressionWithExpectedType),
      };
    }
    case KindSpreadAssignment:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary object literal spread requires finalized provider dictionary-spread semantics before C# emission."));
      return undefined;
    case KindMethodDeclaration:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary object literal methods require finalized callable value carrier facts before C# emission."));
      return undefined;
    default:
      diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary object literal member is outside the current C# planning surface."));
      return undefined;
  }
}

function planRecordDictionaryValue(
  valueNode: Node,
  valueType: TargetTypeRef,
  valueCsharpType: CsharpTypeNode,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression {
  if (isCsharpRecordDictionaryTargetType(valueType) && HasSourceKind(input.ast, valueNode, KindObjectLiteralExpression)) {
    return planRecordDictionaryLiteral(valueNode, sourceFile, input, diagnostics, valueType, planExpressionWithExpectedType);
  }
  return planExpressionWithExpectedType(valueNode, sourceFile, input, diagnostics, valueCsharpType, valueNode);
}

function planRecordDictionaryKey(
  property: Node,
  keyType: TargetTypeRef,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const nameNode = input.ast.name(property) ?? Node_Name(property);
  const sourceName = nameNode === undefined ? "" : Node_Text(nameNode);
  if (nameNode !== undefined && isCsharpStringType(keyType) && isStringKeyNameNode(nameNode, input)) {
    return { kind: "LiteralExpression", value: sourceName };
  }
  if (nameNode !== undefined && isNumericRecordKeyType(keyType) && HasSourceKind(input.ast, nameNode, KindNumericLiteral)) {
    const value = parseFiniteNumberLiteral(sourceName);
    if (value !== undefined) {
      return { kind: "LiteralExpression", value };
    }
  }
  diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary object literal keys require finalized string Record keys or numeric-literal Record keys before C# emission."));
  return undefined;
}

function isStringKeyNameNode(node: Node, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, node, KindIdentifier) ||
    HasSourceKind(input.ast, node, KindStringLiteral) ||
    HasSourceKind(input.ast, node, KindNumericLiteral);
}

function isNumericRecordKeyType(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" && sourcePrimitiveRuntimeKind(type.name) === "number";
}

function getExpectedRecordDictionaryTargetType(
  node: Node,
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
) {
  const expectedType = getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile);
  if (isCsharpRecordDictionaryTargetType(expectedType)) {
    return expectedType;
  }
  const contextualType = getTargetTypeRefForNode(input, node, sourceFile);
  return isCsharpRecordDictionaryTargetType(contextualType) ? contextualType : undefined;
}
