import type { CsharpPlanningContext } from "../context.js";
import {
  AsObjectLiteralExpression,
  AsPropertyAssignment,
  AsShorthandPropertyAssignment,
  SpreadAssignment_Expression,
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
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import {
  csharpSourcePrimitiveRuntimeKind,
  isCsharpRecordDictionaryTargetType,
  isCsharpStringTargetType,
  targetTypeRefEquals,
  getCsharpNullableElementTargetType,
} from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import {
  parseFiniteNumberLiteral,
} from "../../../target-model/syntax/literal-values.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getTargetTypeRefForNode,
} from "../types/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpRecordOperation } from "../objects/indexed-records.js";
import type { ExpectedExpressionPlanner } from "./expression-planner-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, projectCsharpPlannedValue } from "./planned-value-composition.js";

interface PlannedRecordInitializer {
  readonly key: CsharpExpression;
  readonly value: CsharpPlannedValue;
}

export function tryPlanRecordDictionaryLiteralWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedTypeSubject: Node | undefined,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedTargetType?: TargetTypeRef,
): CsharpPlannedValue | undefined {
  if (!HasSourceKind(input.program.source.ast, node, KindObjectLiteralExpression)) {
    return undefined;
  }
  const dictionaryType = getExpectedRecordDictionaryTargetType(node, expectedTypeSubject, sourceFile, input, expectedTargetType);
  if (dictionaryType === undefined) {
    return undefined;
  }
  return planRecordDictionaryLiteral(node, sourceFile, input, diagnostics, dictionaryType, planExpressionWithExpectedType);
}

function planRecordDictionaryLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  dictionaryType: TargetTypeRef,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpPlannedValue | undefined {
  const properties = (AsObjectLiteralExpression(input.program.source.ast, node)!.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined);
  const type = csharpTypeFromTargetTypeRef(dictionaryType, input.scope.typeParameterNames);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Record dictionary object literal emission requires a renderable provider-owned Dictionary target type."));
    return undefined;
  }
  if (properties.length === 0) {
    return csharpPlannedValue(dictionaryType, {
      kind: "ObjectCreationExpression",
      type,
      arguments: [],
    });
  }
  const [keyType, valueType] = dictionaryType.kind === "target-named" ? dictionaryType.typeArguments ?? [] : [];
  if (keyType === undefined || valueType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Record dictionary object literal emission requires finalized key and value target type facts before C# emission."));
    return undefined;
  }
  const valueCsharpType = csharpTypeFromTargetTypeRef(valueType, input.scope.typeParameterNames);
  if (valueCsharpType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Record dictionary object literal values require a renderable finalized value target type before C# emission."));
    return undefined;
  }
  let result: CsharpPlannedValue | undefined = csharpPlannedValue(dictionaryType, { kind: "ObjectCreationExpression", type, collectionInitializers: [] });
  for (const property of properties) {
    if (HasSourceKind(input.program.source.ast, property, KindSpreadAssignment)) {
      const expression = SpreadAssignment_Expression(input.program.source.ast, property);
      const sourceType = getTargetTypeRefForNode(input, expression, sourceFile);
      if (expression === undefined || sourceType === undefined || !targetTypeRefEquals(sourceType, dictionaryType)) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Indexed-record spread requires the exact finalized source and destination dictionary carriers."));
        return undefined;
      }
      const spread = planExpressionWithExpectedType(expression, sourceFile, input, diagnostics, type, expression);
      if (spread === undefined) return undefined;
      const current: CsharpExpression | undefined = result?.completion.kind === "value" ? result.completion.expression : undefined;
      result = result?.prelude.length === 0 && current?.kind === "ObjectCreationExpression" && current.collectionInitializers?.length === 0
        ? projectCsharpPlannedValue(node, sourceFile, input, diagnostics, spread, value => ({
            kind: "ObjectCreationExpression", type, arguments: [{ kind: "Argument", expression: value }],
          }), dictionaryType)
        : buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [result, spread], values =>
            csharpRecordOperation("Extend", values), dictionaryType);
      if (result === undefined) return undefined;
      continue;
    }
    const initializer = planRecordDictionaryInitializer(property, keyType, valueType, valueCsharpType,
      sourceFile, input, diagnostics, planExpressionWithExpectedType);
    if (initializer === undefined) return undefined;
    result = buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [result, initializer.value], values => {
      const previous = values[0]!;
      return previous.kind === "ObjectCreationExpression" && previous.assignments === undefined
        ? { kind: "ObjectCreationExpression", type: previous.type, arguments: previous.arguments, collectionInitializers: [...previous.collectionInitializers ?? [], {
            kind: "IndexerInitializer", arguments: [initializer.key], expression: values[1]!,
          }] }
        : csharpRecordOperation("Set", [previous, initializer.key, values[1]!]);
    }, dictionaryType);
    if (result === undefined) return undefined;
  }
  return result;
}

function planRecordDictionaryInitializer(
  property: Node,
  keyType: TargetTypeRef,
  valueType: TargetTypeRef,
  valueCsharpType: CsharpTypeNode,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): PlannedRecordInitializer | undefined {
  switch (SourceKind(input.program.source.ast, property)) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(input.program.source.ast, property)!;
      if (propertyAssignment.Initializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary property assignment must have an initializer."));
        return undefined;
      }
      const key = planRecordDictionaryKey(property, keyType, input, diagnostics);
      if (key === undefined) {
        return undefined;
      }
      const expression = planRecordDictionaryValue(propertyAssignment.Initializer, valueType, valueCsharpType, sourceFile, input, diagnostics, planExpressionWithExpectedType);
      if (expression === undefined) {
        return undefined;
      }
      return {
        key, value: expression,
      };
    }
    case KindShorthandPropertyAssignment: {
      const shorthand = AsShorthandPropertyAssignment(input.program.source.ast, property)!;
      if (shorthand.ObjectAssignmentInitializer !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary shorthand defaults require finalized default-value semantics before C# emission."));
        return undefined;
      }
      const key = planRecordDictionaryKey(property, keyType, input, diagnostics);
      const nameNode = Node_Name(input.program.source.ast, property);
      if (key === undefined || nameNode === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary shorthand must carry a finalized source name and value carrier before C# emission."));
        return undefined;
      }
      const expression = planRecordDictionaryValue(nameNode, valueType, valueCsharpType, sourceFile, input, diagnostics, planExpressionWithExpectedType);
      if (expression === undefined) {
        return undefined;
      }
      return {
        key, value: expression,
      };
    }
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (isCsharpRecordDictionaryTargetType(valueType) && HasSourceKind(input.program.source.ast, valueNode, KindObjectLiteralExpression)) {
    return planRecordDictionaryLiteral(valueNode, sourceFile, input, diagnostics, valueType, planExpressionWithExpectedType);
  }
  return planExpressionWithExpectedType(valueNode, sourceFile, input, diagnostics, valueCsharpType, valueNode, valueType);
}

function planRecordDictionaryKey(
  property: Node,
  keyType: TargetTypeRef,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const nameNode = input.program.source.ast.name(property) ?? Node_Name(input.program.source.ast, property);
  const sourceName = nameNode === undefined ? "" : Node_Text(input.program.source.ast, nameNode);
  if (nameNode !== undefined && isCsharpStringTargetType(keyType) && isStringKeyNameNode(nameNode, input)) {
    return { kind: "LiteralExpression", value: sourceName };
  }
  if (nameNode !== undefined && isNumericRecordKeyType(keyType) && HasSourceKind(input.program.source.ast, nameNode, KindNumericLiteral)) {
    const value = parseFiniteNumberLiteral(sourceName);
    if (value !== undefined) {
      return { kind: "LiteralExpression", value };
    }
  }
  diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary object literal keys require finalized string Record keys or numeric-literal Record keys before C# emission."));
  return undefined;
}

function isStringKeyNameNode(node: Node, input: CsharpPlanningContext): boolean {
  return HasSourceKind(input.program.source.ast, node, KindIdentifier) ||
    HasSourceKind(input.program.source.ast, node, KindStringLiteral) ||
    HasSourceKind(input.program.source.ast, node, KindNumericLiteral);
}

function isNumericRecordKeyType(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" &&
    csharpSourcePrimitiveRuntimeKind(type.name) === "number";
}

function getExpectedRecordDictionaryTargetType(
  node: Node,
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  explicitType?: TargetTypeRef,
) {
  const expected = explicitType ?? getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile);
  const expectedType = getCsharpNullableElementTargetType(expected) ?? expected;
  if (isCsharpRecordDictionaryTargetType(expectedType)) {
    return expectedType;
  }
  const contextual = getTargetTypeRefForNode(input, node, sourceFile);
  const contextualType = getCsharpNullableElementTargetType(contextual) ?? contextual;
  return isCsharpRecordDictionaryTargetType(contextualType) ? contextualType : undefined;
}
