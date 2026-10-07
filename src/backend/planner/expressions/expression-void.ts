import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { isCsharpVoidTargetType } from "../../../target-model/types/index.js";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import { planCsharpSourceUndefinedValue } from "./undefined-values.js";
import { csharpPlannedEffect, csharpPlannedExpressionIsStable, csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpDiscardedStatement } from "../statements/statement-output.js";

export function planVoidExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  expectedTargetType?: TargetTypeRef,
): CsharpPlannedValue | undefined {
  if (!input.program.source.ast.is.IsVoidExpression(node)) {
    return undefined;
  }
  const operand = input.program.source.ast.as.AsVoidExpression(node)?.Expression;
  const jsValueOperation = input.program.operations.jsVoid(node);
  if (jsValueOperation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a void expression without a sealed operation classification.",
    ));
    return undefined;
  }
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  const operandType = operand === undefined ? undefined : input.types.classifications.resolveNode(operand, sourceFile);
  const target = expectedTargetType ?? input.types.classifications.resolveNode(node, sourceFile);
  const resultType = target === undefined ? undefined : csharpTypeFromTargetTypeRef(target, input.scope.typeParameterNames);
  if (operand === undefined || operandType === undefined || target === undefined || resultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# void translation requires exact sealed operand and result carriers.",
    ));
    return undefined;
  }
  const result = isCsharpVoidTargetType(target) ? undefined
    : planCsharpSourceUndefinedValue(node, target, sourceFile, input, diagnostics);
  if (result !== undefined && result.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(node, "The selected C# void result cannot represent undefined."));
    return undefined;
  }
  const expression = planExpression(operand, sourceFile, input, diagnostics);
  if (expression === undefined) return undefined;
  if (expression.completion.kind === "never") return expression;
  const prelude = expression.completion.kind === "value" && !csharpPlannedExpressionIsStable(expression.completion.expression)
    ? [...expression.prelude, planCsharpDiscardedStatement(expression.completion.expression, expression.completion.carrier)]
    : expression.prelude;
  return result === undefined ? csharpPlannedEffect(target, prelude)
    : csharpPlannedValue(target, result.expression, prelude);
}
