import type { CsharpPlanningContext } from "../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  type TargetTypeRef,
} from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../../analysis/conversions/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getCsharpRuntimeUnionArms,
  getCsharpNullableElementTargetType,
} from "../../../target-model/types/index.js";
import { csharpUnionProjectionPath } from "../../../target-model/types/union-relations.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpUnionPattern } from "./union-patterns.js";

export function tryPlanRuntimeUnionTypeTest(
  node: Node,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  baseExpression: CsharpExpression,
  negated: boolean,
): CsharpExpression | undefined {
  const receiverCarrier = input.types.classifications.resolveNode(node, sourceFile);
  if (receiverCarrier === undefined) {
    return undefined;
  }
  const path = csharpUnionProjectionPath(getCsharpNullableElementTargetType(receiverCarrier) ?? receiverCarrier,
    targetType, input.program.typeDefinitions);
  if (path === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Runtime union type-test emission requires the selected target comparison type to match a finalized runtime-union arm.",
    ));
    return undefined;
  }
  const designation = input.names.temporaryName(`__tsonic_union_test_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}`);
  const { condition } = planCsharpUnionPattern({ kind: "IdentifierName", name: designation }, path, receiverCarrier);
  const test: CsharpExpression = { kind: "SwitchExpression", expression: baseExpression, arms: [
    { pattern: { kind: "VarPattern", designation }, when: condition,
      expression: { kind: "LiteralExpression", value: true } },
    { pattern: { kind: "DiscardPattern" }, expression: { kind: "LiteralExpression", value: false } },
  ] };
  return negated
    ? {
        kind: "PrefixUnaryExpression",
        operatorToken: { kind: "ExclamationToken" },
        operand: test,
      }
    : test;
}

export function tryPlanRuntimeUnionProjectionToTargetType(
  node: Node,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  baseExpression: CsharpExpression,
): CsharpExpression | undefined {
  const storageCarrier = getRuntimeUnionStorageCarrier(node, sourceFile, input);
  if (storageCarrier === undefined) {
    return undefined;
  }
  const path = csharpUnionProjectionPath(getCsharpNullableElementTargetType(storageCarrier) ?? storageCarrier,
    targetType, input.program.typeDefinitions);
  if (path === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Runtime union member projection requires the selected declaring target type to match a finalized runtime-union arm.",
    ));
    return undefined;
  }
  return planCsharpUnionPattern(baseExpression, path, storageCarrier).value;
}

function getRuntimeUnionStorageCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): TargetTypeRef | undefined {
  const storageCarrier = input.types.classifications.resolveStorage(node, sourceFile);
  return getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(storageCarrier) ?? storageCarrier, input.program.typeDefinitions) !== undefined
    ? storageCarrier
    : undefined;
}

export function planCsharpRuntimeUnionProjection(
  node: Node,
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "runtime-union-projection" }>,
  expression: CsharpExpression,
  diagnostics: TargetDiagnostic[],
  input: CsharpPlanningContext,
): CsharpExpression | undefined {
  const sourceElement = getCsharpNullableElementTargetType(sourceType);
  const targetElement = getCsharpNullableElementTargetType(targetType);
  const selectedType = selection.retainsAbsence ? targetElement : targetType;
  if (!input.program.conversions.matchesUnionProjection(sourceType, targetType, selection) ||
    typeof selection.retainsAbsence !== "boolean" || selectedType === undefined ||
    !targetTypeRefEquals(selection.refinement ?? selection.armType, selectedType) ||
    selection.retainsAbsence && (sourceElement === undefined || targetElement === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Union projection requires exact sealed payload and absence correspondence."));
    return undefined;
  }
  const value = planCsharpUnionPattern(expression, selection.path, sourceType, selection.retainsAbsence).value;
  if (selection.refinement === undefined) return value;
  const type = targetType === undefined ? undefined
    : csharpTypeFromTargetTypeRef(targetType, input.scope.typeParameterNames);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Union payload refinement has no exact native target type."));
    return undefined;
  }
  return { kind: "CastExpression", type, expression: value };
}
