import {
  AsPostfixUnaryExpression,
  AsPrefixUnaryExpression,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpPrefixUnaryOperatorToken,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  csharpPostfixUnaryOperatorTokenFromText,
  csharpPrefixUnaryOperatorTokenFromText,
} from "./csharp-operator-tokens.js";
import {
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

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
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# prefix unary operator emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return invalidExpression("missing C# prefix operator token fact");
  }
  const operatorToken = csharpPrefixUnaryOperatorTokenFromText(csharpOperator.operator);
  if (operatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# prefix unary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return invalidExpression("unsupported C# prefix operator token");
  }
  if (!isSupportedPrefixUnaryOperand(expression.Operand, operatorToken, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# prefix unary operator '${csharpOperator.operator}' requires operand runtime-carrier facts that prove the finalized C# token is valid.`));
    return invalidExpression("unsupported C# prefix operator operand");
  }
  return {
    kind: "PrefixUnaryExpression",
    operatorToken,
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
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# postfix unary operator emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return invalidExpression("missing C# postfix operator token fact");
  }
  const operatorToken = csharpPostfixUnaryOperatorTokenFromText(csharpOperator.operator);
  if (operatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# postfix unary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return invalidExpression("unsupported C# postfix operator token");
  }
  return {
    kind: "PostfixUnaryExpression",
    operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
    operatorToken,
  };
}

function isSupportedPrefixUnaryOperand(
  operand: Node | undefined,
  operatorToken: CsharpPrefixUnaryOperatorToken,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  if (operatorToken.kind !== "ExclamationToken") {
    return true;
  }
  const carrier = getRuntimeCarrierForExpression(input, operand, sourceFile);
  if (carrier === undefined) {
    return false;
  }
  if (carrier.kind !== "source-primitive") {
    return true;
  }
  return isCsharpBoolType(csharpTypeFromTargetTypeRef(carrier));
}

function isCsharpBoolType(type: CsharpTypeNode | undefined): boolean {
  return type?.kind === "PredefinedType" && type.name === "bool";
}
