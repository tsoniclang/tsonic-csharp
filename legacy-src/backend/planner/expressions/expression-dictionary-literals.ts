import type { CsharpPlanningContext } from "../context.js";
import {
  AsObjectLiteralExpression,
  AsPropertyAssignment,
  AsShorthandPropertyAssignment,
  SpreadAssignment_Expression,
  HasSourceKind,
  KindMethodDeclaration,
  KindObjectLiteralExpression,
  KindPropertyAssignment,
  KindShorthandPropertyAssignment,
  KindSpreadAssignment,
  Node_Name,
  SourceKind,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import {
  isCsharpRecordDictionaryTargetType,
  targetTypeRefEquals,
} from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
} from "../../target-ast/syntax/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { requireCsharpNativeExpressionUse } from "./native-uses.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpRecordOperation } from "../objects/indexed-records.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, projectCsharpPlannedValue } from "./planned-value-composition.js";
import type { CsharpNativePropertyKey } from "../../../target-model/conversions/exact-literals.js";
import { planCsharpExactLiteralRecipe } from "./literal-conversions.js";

interface PlannedRecordInitializer {
  readonly key: CsharpExpression;
  readonly value: CsharpPlannedValue;
}

export function tryPlanRecordDictionaryLiteralWithCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  carrier: TargetTypeRef,
): CsharpPlannedValue | undefined {
  if (!HasSourceKind(input.program.source.ast, node, KindObjectLiteralExpression)) {
    return undefined;
  }
  if (!isCsharpRecordDictionaryTargetType(carrier)) {
    return undefined;
  }
  return planRecordDictionaryLiteral(node, sourceFile, input, diagnostics, carrier, planExpression);
}

function planRecordDictionaryLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  dictionaryType: TargetTypeRef,
  planExpression: ExpressionPlanner,
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
  const native = requireCsharpNativeExpressionUse(input, node).use;
  if (native.kind === "erased" || native.propertyKeys === undefined) return failCsharpPlannerInvariant(
    "A native dictionary construction requires its sealed property-key literal recipes.", node);
  const keys = new Map(native.propertyKeys.map(key => [key.property, key]));
  let result: CsharpPlannedValue | undefined = csharpPlannedValue(dictionaryType, { kind: "ObjectCreationExpression", type, collectionInitializers: [] });
  for (const property of properties) {
    if (HasSourceKind(input.program.source.ast, property, KindSpreadAssignment)) {
      const expression = SpreadAssignment_Expression(input.program.source.ast, property);
      const source = expression === undefined ? undefined : requireCsharpNativeExpressionUse(input, expression).use;
      const sourceType = source === undefined || source.kind === "erased" || source.completion.kind !== "value"
        ? undefined : source.completion.type;
      if (expression === undefined || sourceType === undefined || !targetTypeRefEquals(sourceType, dictionaryType)) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Indexed-record spread requires the exact finalized source and destination dictionary carriers."));
        return undefined;
      }
      const spread = planExpression(expression, sourceFile, input, diagnostics);
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
    const initializer = planRecordDictionaryInitializer(property, keys.get(property),
      sourceFile, input, diagnostics, planExpression);
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
  selectedKey: CsharpNativePropertyKey | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): PlannedRecordInitializer | undefined {
  switch (SourceKind(input.program.source.ast, property)) {
    case KindPropertyAssignment: {
      const propertyAssignment = AsPropertyAssignment(input.program.source.ast, property)!;
      if (propertyAssignment.Initializer === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary property assignment must have an initializer."));
        return undefined;
      }
      const key = planRecordDictionaryKey(property, selectedKey, input);
      if (key === undefined) {
        return undefined;
      }
      const expression = planExpression(propertyAssignment.Initializer, sourceFile, input, diagnostics);
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
      const key = planRecordDictionaryKey(property, selectedKey, input);
      const nameNode = Node_Name(input.program.source.ast, property);
      if (key === undefined || nameNode === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(property, "Record dictionary shorthand must carry a finalized source name and value carrier before C# emission."));
        return undefined;
      }
      const expression = planExpression(nameNode, sourceFile, input, diagnostics);
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

function planRecordDictionaryKey(
  property: Node,
  selected: CsharpNativePropertyKey | undefined,
  input: CsharpPlanningContext,
): CsharpExpression {
  if (selected === undefined) return failCsharpPlannerInvariant("A native dictionary member requires its exact admitted key binding.", property);
  const literal = planCsharpExactLiteralRecipe(input.scope.typeParameterNames, selected.literal);
  return literal.kind === "resolved" ? literal.expression : failCsharpPlannerInvariant(
    "A native dictionary key requires its renderable exact literal recipe.", selected.name);
}
