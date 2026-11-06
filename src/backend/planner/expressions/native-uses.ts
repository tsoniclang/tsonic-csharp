import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function readCsharpNativeExpressionUse(input: CsharpPlanningContext, expression: Node) {
  return input.program.records.nativeExpression.get(expression);
}

export function requireCsharpNativeExpressionUse(input: CsharpPlanningContext, expression: Node) {
  return readCsharpNativeExpressionUse(input, expression) ?? failCsharpPlannerInvariant(
    "A planned source expression requires its exact pre-seal native emission context.", expression);
}

export function readCsharpNativeExpressionCarrier(input: CsharpPlanningContext, expression: Node): TargetTypeRef | undefined {
  const use = requireCsharpNativeExpressionUse(input, expression).use;
  if (use.kind === "erased") return undefined;
  if (input.storageExpression === expression) return input.program.records.valueRead.get(expression)?.flowReadStorage
    ?? failCsharpPlannerInvariant("An admitted storage expression requires its exact sealed storage carrier.", expression);
  return use.carrier;
}

export function readCsharpNativeDiscardEvaluation(input: CsharpPlanningContext, expression: Node): "evaluate" | "omit" {
  const selected = requireCsharpNativeExpressionUse(input, expression).discardEvaluation;
  return selected === "evaluate" || selected === "omit" ? selected
    : failCsharpPlannerInvariant("A native constant result requires its sealed operand evaluation fact.", expression);
}
