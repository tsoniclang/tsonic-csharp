import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCsharpAbsentValue } from "./optional-storage.js";
import { csharpPlannedEffect, csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpPlannedDiscard } from "../statements/statement-output.js";

export function planVoidExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, target: TargetTypeRef): CsharpPlannedValue | undefined {
  if (!input.program.source.ast.is.IsVoidExpression(node)) return undefined;
  const operand = input.program.source.ast.as.AsVoidExpression(node)?.Expression;
  const operation = input.program.records.jsVoid.get(node);
  const selected = input.program.records.typeEmission.get(target);
  if (operand === undefined || operation === undefined || operation.kind === "rejected" || selected === undefined)
    failCsharpPlannerInvariant("An admitted void expression requires its exact operand, operation and native completion.", node);
  const expression = planExpression(operand, sourceFile, input, diagnostics)
    ?? failCsharpPlannerInvariant("An admitted void expression requires its planned operand.", operand);
  if (expression.completion.kind === "never") return expression;
  const prelude = planCsharpPlannedDiscard(expression);
  if (selected.completion === "void") return { ...csharpPlannedEffect(target, prelude), effect: expression.effect };
  const result = planCsharpAbsentValue(target, input)
    ?? failCsharpPlannerInvariant("An admitted void result requires its native absence value.", node);
  return csharpPlannedValue(target, result, prelude);
}
