import {
  AsBinaryExpression,
  AsIdentifier,
  HasSourceKind,
  KindBinaryExpression,
  KindIdentifier,
  KindNullKeyword,
  KindVoidExpression,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpBinaryOperatorToken, CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import type { OperationSemanticOwnership } from "./semantic-guards.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  getBinaryLeft,
  getBinaryRight,
} from "./expression-binary-operands.js";
import {
  tryPlanTypeofComparisonExpression,
  tryPlanTypeTestExpression,
} from "./expression-typeof-operators.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  csharpAssignmentOperatorTokenFromText,
  csharpBinaryOperatorTokenFromText,
} from "./csharp-operator-tokens.js";

export {
  planTypeofExpression,
} from "./expression-typeof-operators.js";

export function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindBinaryExpression)) {
    return undefined;
  }
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Binary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target operator");
  }
  const expression = AsBinaryExpression(node)!;
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  const typeTest = tryPlanTypeTestExpression(expression, selectedOperator, sourceFile, input, diagnostics, planExpression);
  if (typeTest !== undefined) {
    return typeTest;
  }
  const typeofComparison = tryPlanTypeofComparisonExpression(expression, selectedOperator, sourceFile, input, diagnostics, planExpression);
  if (typeofComparison !== undefined) {
    return typeofComparison;
  }
  if (selectedOperator === undefined) {
    const leftOwnership = getProviderOperationOwnership(left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target operator fact");
  }
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# binary operator emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return invalidExpression("missing C# operator token fact");
  }
  const binaryOperatorToken = csharpBinaryOperatorTokenFromText(csharpOperator.operator);
  const assignmentOperatorToken = csharpAssignmentOperatorTokenFromText(csharpOperator.operator);
  if (binaryOperatorToken === undefined && assignmentOperatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# binary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return invalidExpression("unsupported C# operator token");
  }
  if (assignmentOperatorToken !== undefined) {
    return {
      kind: "AssignmentExpression",
      left: planExpression(left!, sourceFile, input, diagnostics),
      operatorToken: assignmentOperatorToken,
      right: planExpression(right!, sourceFile, input, diagnostics),
    };
  }
  if (binaryOperatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# binary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return invalidExpression("unsupported C# binary operator token");
  }
  return {
    kind: "BinaryExpression",
    left: planBinaryOperand(left!, binaryOperatorToken, sourceFile, input, diagnostics, planExpression),
    operatorToken: binaryOperatorToken,
    right: planBinaryOperand(right!, binaryOperatorToken, sourceFile, input, diagnostics, planExpression),
  };
}

function planBinaryOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  return isNullishEqualityOperand(operand, operatorToken, sourceFile, input)
    ? { kind: "LiteralExpression", value: null }
    : planExpression(operand, sourceFile, input, diagnostics);
}

function isNullishEqualityOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  if (operatorToken.kind !== "EqualsEqualsToken" && operatorToken.kind !== "ExclamationEqualsToken") {
    return false;
  }
  const kind = SourceKind(input.ast, operand);
  if (kind === KindNullKeyword || kind === KindVoidExpression) {
    return true;
  }
  if (kind !== KindIdentifier || Node_Text(AsIdentifier(operand)) !== "undefined") {
    return false;
  }
  const type = input.semantics.getTypeAtLocation(operand, { sourceFile });
  return type === undefined ? false : input.types.isNullish(type);
}

function combineOwnership(left: OperationSemanticOwnership, right: OperationSemanticOwnership): OperationSemanticOwnership {
  const reasons = [...left.reasons, ...right.reasons];
  return {
    requiresTargetFact: left.requiresTargetFact || right.requiresTargetFact,
    sourceOwned: left.sourceOwned && right.sourceOwned,
    reasons,
  };
}
