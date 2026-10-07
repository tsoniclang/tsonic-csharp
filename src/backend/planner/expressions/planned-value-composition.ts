import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/roslyn/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { isCsharpNeverTargetType } from "../../../target-model/types/scalar-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { qualifiedCsharpType } from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planCsharpNeverValue } from "./never-values.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/index.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { planCsharpAbsentValue, planCsharpPresentValueGuard } from "./optional-storage.js";
import { convertCsharpPlannedValue } from "./planned-value-conversions.js";
import {
  csharpPlannedValue, csharpPlannedEffect, sequenceCsharpPlannedValues,
  planCsharpPlannedBranch, type CsharpPlannedValue, type CsharpPlannedOperand, type CsharpPlannedCapture, type CsharpPlannedLocationCapture,
} from "./planned-values.js";

export function planCsharpExpressionCompletion(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expression: CsharpExpression | undefined,
  carrier = input.types.classifications.resolveNode(node, sourceFile),
  prelude: readonly CsharpStatement[] = [],
): CsharpPlannedValue | undefined {
  if (expression === undefined) return undefined;
  if (carrier === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Native expression planning requires its exact finalized completion carrier."));
    return undefined;
  }
  if (isCsharpNeverTargetType(carrier)) return csharpPlannedEffect(carrier, [...prelude, {
    kind: "ThrowStatement", expression: planCsharpNeverValue(expression, qualifiedCsharpType("System", "Exception")),
  }]);
  if (isCsharpVoidTargetType(carrier)) {
    let statement = expression;
    while (statement.kind === "ParenthesizedExpression") statement = statement.expression;
    return csharpPlannedEffect(carrier, [...prelude, { kind: "ExpressionStatement", expression: statement }]);
  }
  return csharpPlannedValue(carrier, expression, prelude);
}

export function captureCsharpPlannedValue(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  carrier: TargetTypeRef,
): CsharpPlannedCapture | undefined {
  const type = csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Native ordered evaluation requires a renderable exact temporary carrier."));
    return undefined;
  }
  return { type, name: input.names.temporaryName(`__tsonic_value_${input.program.source.ast.pos(node)}`) };
}

export function composeCsharpPlannedValues(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  operands: readonly (CsharpPlannedOperand | undefined)[],
  complete: (expressions: readonly CsharpExpression[]) => CsharpPlannedValue | undefined,
  capture: (carrier: TargetTypeRef, operand: CsharpPlannedValue) => CsharpPlannedCapture | CsharpPlannedLocationCapture | undefined =
    carrier => captureCsharpPlannedValue(node, input, diagnostics, carrier),
): CsharpPlannedValue | undefined {
  const selected = operands.filter((operand): operand is CsharpPlannedOperand => operand !== undefined);
  if (selected.length !== operands.length) return undefined;
  return sequenceCsharpPlannedValues(selected, capture, complete);
}

export function projectCsharpPlannedValue(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planned: CsharpPlannedValue | undefined,
  project: (expression: CsharpExpression) => CsharpExpression | undefined,
  carrier = input.types.classifications.resolveNode(node, sourceFile),
): CsharpPlannedValue | undefined {
  if (planned === undefined) return undefined;
  if (planned.completion.kind === "never") return planned;
  if (planned.completion.kind !== "value") return undefined;
  return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
    project(planned.completion.expression), carrier, planned.prelude);
}

export function buildCsharpPlannedValue(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  operands: readonly (CsharpPlannedValue | undefined)[],
  build: (expressions: readonly CsharpExpression[]) => CsharpExpression | undefined,
  carrier = input.types.classifications.resolveNode(node, sourceFile),
): CsharpPlannedValue | undefined {
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, operands, values =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, build(values), carrier));
}

export function planCsharpValueBranch(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  condition: CsharpPlannedValue | undefined,
  consequent: CsharpPlannedValue | undefined,
  alternative: CsharpPlannedValue | undefined,
  carrier = input.types.classifications.resolveNode(node, sourceFile),
): CsharpPlannedValue | undefined {
  if (condition === undefined || consequent === undefined || alternative === undefined || carrier === undefined) return undefined;
  const statements = consequent.prelude.length > 0 || alternative.prelude.length > 0 ||
    consequent.completion.kind !== "value" || alternative.completion.kind !== "value";
  const capture = !statements || isCsharpVoidTargetType(carrier) || isCsharpNeverTargetType(carrier)
    ? undefined : captureCsharpPlannedValue(node, input, diagnostics, carrier);
  return planCsharpPlannedBranch(condition, consequent, alternative, carrier, capture);
}

export function planCsharpOptionalReceiverValue(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  receiver: CsharpPlannedValue | undefined,
  present: (expression: CsharpExpression) => CsharpPlannedValue | undefined,
  carrier = input.types.classifications.resolveNode(node, sourceFile),
): CsharpPlannedValue | undefined {
  if (receiver === undefined || carrier === undefined) return undefined;
  if (receiver.completion.kind === "never") return receiver;
  if (receiver.completion.kind !== "value") return undefined;
  const storage = receiver.completion.carrier;
  const element = getCsharpGenericOptionalParts(storage)?.element ?? getCsharpNullableElementTargetType(storage) ?? storage;
  const name = input.names.temporaryName(`__tsonic_present_${input.program.source.ast.pos(node)}`);
  const guard = planCsharpPresentValueGuard(storage, element, receiver.completion.expression, name, input.scope.typeParameterNames);
  if (guard === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Optional evaluation requires its exact native storage and present-value relation."));
    return undefined;
  }
  const absent = isCsharpVoidTargetType(carrier) ? csharpPlannedEffect(carrier, [])
    : planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
      planCsharpAbsentValue(carrier, input.scope.typeParameterNames), carrier);
  const selected = present(guard.value);
  return planCsharpValueBranch(node, sourceFile, input, diagnostics,
    csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), guard.condition, receiver.prelude),
    selected === undefined ? undefined : convertCsharpPlannedValue(node, sourceFile, input, diagnostics, selected, carrier, "implicit"),
    absent, carrier);
}
