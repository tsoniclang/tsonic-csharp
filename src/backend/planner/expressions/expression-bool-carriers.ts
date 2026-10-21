import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { translateCsharpJsValueInvocation } from "./js-value-operations.js";
import { mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpConditionExpression(expression: Node, context: string, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue | undefined {
  const operation = input.program.records.jsCondition.get(expression);
  if (operation === undefined || operation.kind === "rejected")
    failCsharpPlannerInvariant(`An admitted ${context} requires its sealed native condition classification.`, expression);
  const planned = planExpression(expression, sourceFile, input, diagnostics)
    ?? failCsharpPlannerInvariant(`An admitted ${context} requires its planned operand.`, expression);
  return operation.kind !== "resolved" ? planned : mapCsharpPlannedValue(planned, csharpSourcePrimitiveTargetType("bool"), expression =>
    translateCsharpJsValueInvocation(input.scope.typeParameterNames, operation, undefined, [expression]));
}
