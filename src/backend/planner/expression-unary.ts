import {
  AsPostfixUnaryExpression,
  AsPrefixUnaryExpression,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import {
  getSourceOwnedUnaryOperator,
  getUnaryOperatorKind,
} from "./expression-operators.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";

export function planPrefixUnaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  const expression = AsPrefixUnaryExpression(node)!;
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  const operator = selectedOperator?.operationKind === "operator"
    ? selectedOperator.targetOperation
    : getSourceOwnedUnaryOperator(getUnaryOperatorKind(expression), expression.Operand, sourceFile, input);
  if (operator === undefined) {
    const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# prefix unary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target prefix operator fact");
  }
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Prefix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target prefix operator");
  }
  return {
    kind: "PrefixUnaryExpression",
    operator,
    operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
  };
}

export function planPostfixUnaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  const expression = AsPostfixUnaryExpression(node)!;
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  const operator = selectedOperator?.operationKind === "operator"
    ? selectedOperator.targetOperation
    : getSourceOwnedUnaryOperator(getUnaryOperatorKind(expression), expression.Operand, sourceFile, input);
  if (operator === undefined) {
    const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# postfix unary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target postfix operator fact");
  }
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Postfix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target postfix operator");
  }
  return {
    kind: "PostfixUnaryExpression",
    operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
    operator,
  };
}
