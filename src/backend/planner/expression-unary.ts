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
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Prefix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target prefix operator");
  }
  if (selectedOperator === undefined) {
    const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# prefix unary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target prefix operator fact");
  }
  return {
    kind: "PrefixUnaryExpression",
    operator: selectedOperator.targetOperation,
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
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Postfix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target postfix operator");
  }
  if (selectedOperator === undefined) {
    const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# postfix unary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target postfix operator fact");
  }
  return {
    kind: "PostfixUnaryExpression",
    operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
    operator: selectedOperator.targetOperation,
  };
}
