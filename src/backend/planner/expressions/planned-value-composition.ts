import { captureCsharpPlannedValue } from "./value-captures.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../planning-data.js";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpAbsentValue, planCsharpPresentValueGuard } from "./optional-storage.js";
import { convertCsharpPlannedValue } from "./planned-value-conversions.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";
import { csharpPlannedAddressOperand } from "./planned-locations.js";
import {
  csharpPlannedValue, csharpPlannedEffect, sequenceCsharpPlannedValues,
  planCsharpPlannedBranch, type CsharpPlannedValue, type CsharpPlannedOperand, type CsharpPlannedCapture, type CsharpPlannedLocationCapture,
} from "./planned-values.js";

export function composeCsharpPlannedValues(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
  operands: readonly (CsharpPlannedOperand | undefined)[],
  complete: (expressions: readonly CsharpExpression[]) => CsharpPlannedValue | undefined,
  capture: (carrier: TargetTypeRef, operand: CsharpPlannedValue) => CsharpPlannedCapture | CsharpPlannedLocationCapture | undefined =
    carrier => captureCsharpPlannedValue(node, input, carrier),
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
  project: (expression: CsharpExpression, prelude: CsharpStatement[]) => CsharpExpression | undefined,
  carrier = readCsharpNativeExpressionCarrier(input, node),
): CsharpPlannedValue | undefined {
  if (planned === undefined) return undefined;
  if (planned.completion.kind === "never") return planned;
  if (planned.completion.kind !== "value") return undefined;
  const prelude = [...planned.prelude];
  return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
    project(planned.completion.expression, prelude), carrier, prelude);
}

export function buildCsharpPlannedValue(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  operands: readonly (CsharpPlannedValue | undefined)[],
  build: (expressions: readonly CsharpExpression[]) => CsharpExpression | undefined,
  carrier = readCsharpNativeExpressionCarrier(input, node),
): CsharpPlannedValue | undefined {
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, operands, values =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, build(values), carrier));
}

export function projectCsharpPlannedMember(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  receiver: CsharpPlannedValue,
  name: string,
  conditional = false,
  staticMember = false,
  carrier = readCsharpNativeExpressionCarrier(input, node),
): CsharpPlannedValue | undefined {
  const result = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value => ({
    kind: conditional ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression", receiver: value, name,
  }), carrier);
  if (result === undefined || result.completion.kind !== "value" || receiver.completion.kind !== "value") return result;
  return { ...result, address: { kind: "member", receiver: csharpPlannedAddressOperand(receiver), name, static: staticMember } };
}

export function planCsharpValueBranch(
  node: Node,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
  condition: CsharpPlannedValue | undefined,
  consequent: CsharpPlannedValue | undefined,
  alternative: CsharpPlannedValue | undefined,
  carrier = readCsharpNativeExpressionCarrier(input, node),
): CsharpPlannedValue | undefined {
  if (condition === undefined || consequent === undefined || alternative === undefined || carrier === undefined) return undefined;
  const statements = consequent.prelude.length > 0 || alternative.prelude.length > 0 ||
    consequent.completion.kind !== "value" || alternative.completion.kind !== "value";
  const completion = input.program.records.typeEmission.get(carrier)?.completion ??
    failCsharpPlannerInvariant("An admitted branch requires its native completion kind.", node);
  const capture = !statements || completion !== "value" ? undefined : captureCsharpPlannedValue(node, input, carrier);
  return planCsharpPlannedBranch(condition, consequent, alternative, carrier, capture, completion);
}

export function planCsharpCoalescingValue(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  left: CsharpPlannedValue,
  right: CsharpPlannedValue,
  carrier: TargetTypeRef,
): CsharpPlannedValue | undefined {
  if (left.completion.kind === "never") return left;
  if (left.completion.kind !== "value") return undefined;
  const storage = left.completion.carrier;
  const selected = input.program.records.typeEmission.get(storage)
    ?? failCsharpPlannerInvariant("An admitted coalescing operand requires its native storage plan.", node);
  if (selected.nullable && targetTypeRefEquals(storage, carrier) &&
    right.prelude.length === 0 && right.completion.kind === "value" && targetTypeRefEquals(right.completion.carrier, storage) &&
    right.absent === true) return left;
  if (selected.coalescing === "operator" &&
    right.prelude.length === 0 && right.completion.kind === "value") {
    return csharpPlannedValue(carrier, { kind: "BinaryExpression", left: left.completion.expression,
      operatorToken: { kind: "QuestionQuestionToken" }, right: right.completion.expression }, left.prelude);
  }
  const present = selected.optionalStorage.present;
  const name = input.names.temporaryName(`__tsonic_present_${input.program.source.ast.pos(node)}`);
  const guard = planCsharpPresentValueGuard(storage, present, left.completion.expression, name, input);
  return planCsharpValueBranch(node, sourceFile, input, diagnostics,
    csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), guard.condition, left.prelude),
    convertCsharpPlannedValue(node, sourceFile, input, diagnostics, csharpPlannedValue(present, guard.value), carrier, "implicit"),
    right, carrier);
}

export function planCsharpOptionalReceiverValue(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  receiver: CsharpPlannedValue | undefined,
  present: (expression: CsharpExpression) => CsharpPlannedValue | undefined,
  carrier = readCsharpNativeExpressionCarrier(input, node),
): CsharpPlannedValue | undefined {
  if (receiver === undefined || carrier === undefined) return undefined;
  if (receiver.completion.kind === "never") return receiver;
  if (receiver.completion.kind !== "value") return undefined;
  const storage = receiver.completion.carrier;
  const element = input.program.records.typeEmission.get(storage)?.optionalStorage.present
    ?? failCsharpPlannerInvariant("An admitted optional receiver requires its native present-value plan.", node);
  const name = input.names.temporaryName(`__tsonic_present_${input.program.source.ast.pos(node)}`);
  const guard = planCsharpPresentValueGuard(storage, element, receiver.completion.expression, name, input);
  const completion = input.program.records.typeEmission.get(carrier)?.completion
    ?? failCsharpPlannerInvariant("An admitted optional result requires its native completion.", node);
  const absent = completion === "void" ? csharpPlannedEffect(carrier, [])
    : planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
      planCsharpAbsentValue(carrier, input), carrier);
  const selected = present(guard.value);
  return planCsharpValueBranch(node, sourceFile, input, diagnostics,
    csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), guard.condition, receiver.prelude),
    selected === undefined ? undefined : convertCsharpPlannedValue(node, sourceFile, input, diagnostics, selected, carrier, "implicit"),
    absent, carrier);
}
