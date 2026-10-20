import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { mapCsharpPlannedValue } from "./planned-values.js";
import { csharpPostfixUnaryOperatorTokenFromText, csharpPrefixUnaryOperatorTokenFromText } from "../../target-ast/syntax/operator-tokens.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { translateCsharpJsValueInvocation } from "./js-value-operations.js";
import { planCsharpExactLiteralRecipe } from "./literal-conversions.js";
import { planCsharpExpressionCompletion, projectCsharpPlannedValue } from "./planned-value-composition.js";

export function planPrefixUnaryExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue {
  return planUnary(node, sourceFile, input, diagnostics, planExpression);
}

export function planPostfixUnaryExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue {
  return planUnary(node, sourceFile, input, diagnostics, planExpression);
}

function planUnary(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue {
  const selected = input.program.records.unaryEmission.get(node)
    ?? failCsharpPlannerInvariant("An admitted unary expression requires its sealed native emission.", node);
  if (selected.kind === "literal") {
    const literal = planCsharpExactLiteralRecipe(input.scope.typeParameterNames, selected.recipe);
    if (literal.kind !== "resolved") failCsharpPlannerInvariant("An admitted unary literal requires its exact native recipe.", node);
    return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, literal.expression, selected.carrier)
      ?? failCsharpPlannerInvariant("An admitted unary literal requires its native completion.", node);
  }
  const operand = planExpression(selected.operand, sourceFile, selected.kind === "native" && selected.storage !== undefined
    ? { ...input, storageExpression: selected.storage } : input, diagnostics)
    ?? failCsharpPlannerInvariant("An admitted unary expression requires its native operand.", selected.operand);
  if (selected.kind === "js-value") return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, operand,
    value => translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.invocation, undefined, [value]))
    ?? failCsharpPlannerInvariant("An admitted closed unary expression requires its native invocation.", node);
  if (selected.postfix) {
    const token = csharpPostfixUnaryOperatorTokenFromText(selected.operator)
      ?? failCsharpPlannerInvariant("An admitted postfix operator requires its native token.", node);
    return mapCsharpPlannedValue(operand, selected.carrier, value => ({ kind: "PostfixUnaryExpression", operatorToken: token, operand: value }))
      ?? failCsharpPlannerInvariant("An admitted postfix expression requires its native value completion.", node);
  }
  const token = csharpPrefixUnaryOperatorTokenFromText(selected.operator)
    ?? failCsharpPlannerInvariant("An admitted prefix operator requires its native token.", node);
  return mapCsharpPlannedValue(operand, selected.carrier, value => ({ kind: "PrefixUnaryExpression", operatorToken: token, operand: value }))
    ?? failCsharpPlannerInvariant("An admitted prefix expression requires its native value completion.", node);
}
