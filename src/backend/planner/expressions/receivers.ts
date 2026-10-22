import type { SourceFile } from "@tsonic/tsts";
import type { CsharpSelectedReceiverEvidence } from "../../../target-model/records/member-receivers.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpMemberReceiverProjection } from "../../../target-model/records/operations.js";
import { applyCsharpConversionSelection } from "./conversions.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpTypeFromProjectSourceReferenceNode } from "../types/project-source-types.js";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function csharpProjectTypeReceiver(receiver: CsharpSelectedReceiverEvidence,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): CsharpTypeNode | undefined {
  const selected = input.program.records.memberReceiver.get(receiver.expression, receiver.valueDeclaration);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted member receiver requires its exact native acquisition plan.", receiver.expression);
  if (selected.kind === "value") return undefined;
  const sourceFile = input.program.source.ast.getSourceFile(selected.reference);
  if (sourceFile === undefined) failCsharpPlannerInvariant("An admitted type receiver requires its checked source module.", selected.reference);
  return getCsharpTypeFromProjectSourceReferenceNode(selected.reference, sourceFile, input, diagnostics);
}

export function translateCsharpSelectedReceiver(receiver: CsharpSelectedReceiverEvidence, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner,
  projection?: CsharpMemberReceiverProjection): CsharpPlannedValue | undefined {
  const projectType = csharpProjectTypeReceiver(receiver, input, diagnostics);
  const carrier = projectType === undefined ? undefined : input.program.records.nodeTargetType.get(receiver.expression);
  if (projectType !== undefined && carrier === undefined)
    failCsharpPlannerInvariant("An admitted project type receiver requires its exact native value contract.", receiver.expression);
  const expression = projectType === undefined ? planExpression(receiver.expression, sourceFile, input, diagnostics)
    : csharpPlannedValue(carrier!, projectType);
  if (projection === undefined || expression === undefined || expression.completion.kind === "never") return expression;
  if (projection.conversion.kind !== "rejected" && expression.completion.kind === "value" && targetTypeRefEquals(expression.completion.carrier, projection.target)) return expression;
  if (expression.completion.kind !== "value" || !targetTypeRefEquals(expression.completion.carrier, projection.source))
    failCsharpPlannerInvariant("An admitted receiver projection requires its exact native value completion.", receiver.expression);
  return mapCsharpPlannedValue(expression, projection.target, value => applyCsharpConversionSelection(receiver.expression,
    sourceFile, input, diagnostics, projection.source, projection.target, projection.conversion, value));
}
