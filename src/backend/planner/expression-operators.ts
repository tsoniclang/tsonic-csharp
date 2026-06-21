import {
  AsBinaryExpression,
  HasSourceKind,
  KindNullKeyword,
  SourceTokenKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { getTargetTypeRefForNode } from "./runtime-carriers.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import type { OperationSemanticOwnership } from "./semantic-guards.js";
import { targetTypeRefsMatch } from "./target-types.js";
import { isProjectSourceTypeRef } from "./project-source-types.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  getBinaryLeft,
  getBinaryOperatorToken,
  getBinaryRight,
} from "./expression-binary-operands.js";
import {
  tryPlanTypeofComparisonExpression,
  tryPlanTypeTestExpression,
} from "./expression-typeof-operators.js";

export {
  getSourceOwnedUnaryOperator,
  getUnaryOperatorKind,
} from "./expression-unary-operators.js";
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
  const operator = selectedOperator?.targetOperation ?? getSourceOwnedBinaryOperator(expression, sourceFile, input);
  if (operator === undefined) {
    const leftOwnership = getProviderOperationOwnership(left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target operator fact");
  }
  return {
    kind: "BinaryExpression",
    left: planExpression(left!, sourceFile, input, diagnostics),
    operator,
    right: planExpression(right!, sourceFile, input, diagnostics),
  };
}

function getSourceOwnedBinaryOperator(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  const tokenKind = SourceTokenKind(input.ast, getBinaryOperatorToken(expression));
  const targetAssignment = getTargetOwnedAssignmentOperator(tokenKind, expression, sourceFile, input);
  if (targetAssignment !== undefined) {
    return targetAssignment;
  }
  const targetNullish = getTargetOwnedNullishOperator(tokenKind, expression, sourceFile, input);
  if (targetNullish !== undefined) {
    return targetNullish;
  }
  const targetEquality = getTargetOwnedEqualityOperator(tokenKind, expression, sourceFile, input);
  if (targetEquality !== undefined) {
    return targetEquality;
  }
  const ownership = combineOwnership(
    getProviderOperationOwnership(getBinaryLeft(expression), sourceFile, input),
    getProviderOperationOwnership(getBinaryRight(expression), sourceFile, input),
  );
  if (!ownership.sourceOwned) {
    return undefined;
  }
  switch (tokenKind) {
    case "KindEqualsToken":
      return "=";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindAsteriskToken":
      return "*";
    case "KindSlashToken":
      return "/";
    case "KindPercentToken":
      return "%";
    case "KindLessThanToken":
      return "<";
    case "KindLessThanEqualsToken":
      return "<=";
    case "KindGreaterThanToken":
      return ">";
    case "KindGreaterThanEqualsToken":
      return ">=";
    case "KindEqualsEqualsToken":
    case "KindEqualsEqualsEqualsToken":
      return "==";
    case "KindExclamationEqualsToken":
    case "KindExclamationEqualsEqualsToken":
      return "!=";
    case "KindAmpersandAmpersandToken":
      return "&&";
    case "KindBarBarToken":
      return "||";
    case "KindPlusEqualsToken":
      return "+=";
    case "KindMinusEqualsToken":
      return "-=";
    case "KindAsteriskEqualsToken":
      return "*=";
    case "KindSlashEqualsToken":
      return "/=";
    case "KindPercentEqualsToken":
      return "%=";
    default:
      return undefined;
  }
}

function getTargetOwnedAssignmentOperator(
  tokenKind: string,
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  if (tokenKind !== "KindEqualsToken") {
    return undefined;
  }
  const leftNode = getBinaryLeft(expression);
  const rightNode = getBinaryRight(expression);
  const left = getTargetTypeRefForNode(input, leftNode, sourceFile);
  const right = getTargetTypeRefForNode(input, rightNode, sourceFile);
  if (left === undefined) {
    return undefined;
  }
  if (isNullLiteral(rightNode, input)) {
    return "=";
  }
  if (right === undefined) {
    return undefined;
  }
  return targetTypeRefsMatch(left, right)
    ? "="
    : undefined;
}

function getTargetOwnedNullishOperator(
  tokenKind: string,
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  if (tokenKind !== "KindQuestionQuestionToken") {
    return undefined;
  }
  const left = getTargetTypeRefForNode(input, getBinaryLeft(expression), sourceFile);
  const right = getTargetTypeRefForNode(input, getBinaryRight(expression), sourceFile);
  return left !== undefined && right !== undefined ? "??" : undefined;
}

function getTargetOwnedEqualityOperator(
  tokenKind: string,
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  const equality = tokenKind === "KindEqualsEqualsToken" || tokenKind === "KindEqualsEqualsEqualsToken";
  const inequality = tokenKind === "KindExclamationEqualsToken" || tokenKind === "KindExclamationEqualsEqualsToken";
  if (!equality && !inequality) {
    return undefined;
  }
  const left = getTargetTypeRefForNode(input, getBinaryLeft(expression), sourceFile);
  const right = getTargetTypeRefForNode(input, getBinaryRight(expression), sourceFile);
  if (left === undefined || right === undefined || !targetTypeRefsMatch(left, right) || !isProjectSourceTypeRef(left)) {
    return undefined;
  }
  return equality ? "==" : "!=";
}

function combineOwnership(left: OperationSemanticOwnership, right: OperationSemanticOwnership): OperationSemanticOwnership {
  const reasons = [...left.reasons, ...right.reasons];
  return {
    requiresTargetFact: left.requiresTargetFact || right.requiresTargetFact,
    sourceOwned: left.sourceOwned && right.sourceOwned,
    reasons,
  };
}

function isNullLiteral(node: Node | undefined, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, node, KindNullKeyword);
}
