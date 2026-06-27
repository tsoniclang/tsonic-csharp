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
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
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
): CsharpExpression | undefined {
  const expression = AsPrefixUnaryExpression(node)!;
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Prefix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return undefined;
  }
  if (selectedOperator === undefined) {
    const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# prefix unary operator emission requires a selected provider operator fact.", ownership);
    return undefined;
  }
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# prefix unary operator emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return undefined;
  }
  const operatorToken = csharpPrefixUnaryOperatorTokenFromText(csharpOperator.operator);
  if (operatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# prefix unary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return undefined;
  }
  const operandCarrierResolution = resolveRuntimeCarrierForExpression(input, expression.Operand, sourceFile);
  if (!isSupportedPrefixUnaryOperand(operandCarrierResolution, operatorToken)) {
    const detail = missingCarrierDiagnosticDetail(operandCarrierResolution, "Operand runtime carrier fact does not prove the finalized C# token is valid.");
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# prefix unary operator '${csharpOperator.operator}' requires operand runtime-carrier facts that prove the finalized C# token is valid. ${detail.reason}`, detail.evidence));
    return undefined;
  }
  const operand = planExpression(expression.Operand!, sourceFile, input, diagnostics);
  if (operand === undefined) {
    return undefined;
  }
  return {
    kind: "PrefixUnaryExpression",
    operatorToken,
    operand,
  };
}

export function planPostfixUnaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsPostfixUnaryExpression(node)!;
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Postfix unary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return undefined;
  }
  if (selectedOperator === undefined) {
    const ownership = getProviderOperationOwnership(expression.Operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# postfix unary operator emission requires a selected provider operator fact.", ownership);
    return undefined;
  }
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# postfix unary operator emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return undefined;
  }
  const operatorToken = csharpPostfixUnaryOperatorTokenFromText(csharpOperator.operator);
  if (operatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# postfix unary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return undefined;
  }
  const operand = planExpression(expression.Operand!, sourceFile, input, diagnostics);
  if (operand === undefined) {
    return undefined;
  }
  return {
    kind: "PostfixUnaryExpression",
    operand,
    operatorToken,
  };
}

function isSupportedPrefixUnaryOperand(
  operandCarrierResolution: ReturnType<typeof resolveRuntimeCarrierForExpression>,
  operatorToken: CsharpPrefixUnaryOperatorToken,
): boolean {
  if (operatorToken.kind !== "ExclamationToken") {
    return true;
  }
  const carrier = probeCarrierFromResolution(operandCarrierResolution);
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
