import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type { CsharpMemberReceiverProjection } from "../../../analysis/operations/index.js";
import { applyCsharpConversionSelection } from "./conversions.js";
import { mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export interface CsharpSelectedReceiverEvidence {
  readonly expression: Node;
  readonly type: Type;
}

export function translateCsharpSelectedReceiver(
  receiver: CsharpSelectedReceiverEvidence,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  projection?: CsharpMemberReceiverProjection,
): CsharpPlannedValue | undefined {
  const expression = planExpression(
    receiver.expression,
    sourceFile,
    input,
    diagnostics,
  );
  if (projection === undefined || expression === undefined || expression.completion.kind === "never") return expression;
  if (projection.conversion.kind !== "rejected" && expression.completion.kind === "value" &&
    targetTypeRefEquals(expression.completion.carrier, projection.target)) return expression;
  if (expression.completion.kind !== "value" || !targetTypeRefEquals(expression.completion.carrier, projection.source)) {
    diagnostics.push(unsupportedNodeDiagnostic(receiver.expression,
      "A selected C# receiver projection conflicts with its exact planned completion carrier."));
    return undefined;
  }
  return mapCsharpPlannedValue(expression, projection.target, value =>
    applyCsharpConversionSelection(receiver.expression, sourceFile, input, diagnostics,
      projection.source, projection.target, projection.conversion, value));
}
