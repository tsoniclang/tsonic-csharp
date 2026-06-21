import {
  AsBinaryExpression,
  HasSourceKind,
  KindNullKeyword,
  KindTypeOfExpression,
  Node_Expression,
  SourceTokenKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import { expressionToCsharpType, predefined } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { getTargetTypeRefForNode } from "./runtime-carriers.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import type { OperationSemanticOwnership } from "./semantic-guards.js";
import { csharpTypeFromTargetTypeRef, targetTypeRefsMatch } from "./target-types.js";
import { isProjectSourceTypeRef } from "./project-source-types.js";

type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
) => CsharpExpression;

export function planTypeofExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator === undefined) {
    const operand = Node_Expression(node);
    const ownership = getProviderOperationOwnership(operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# typeof expression emission requires a selected provider typeof operator fact.", ownership);
    return invalidExpression("missing target typeof operator fact");
  }
  if (selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Typeof expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target typeof operator");
  }
  const runtimeKind = getStandaloneTypeofRuntimeKind(selectedOperator.targetOperation);
  if (runtimeKind === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Typeof expression expected a provider typeof operator fact, but provider selected '${selectedOperator.targetOperation}'.`));
    return invalidExpression("selected target non-typeof operator");
  }
  return { kind: "LiteralExpression", value: runtimeKind };
}

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

export function getSourceOwnedUnaryOperator(
  operatorKind: unknown,
  operand: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  if (!getProviderOperationOwnership(operand, sourceFile, input).sourceOwned) {
    return undefined;
  }
  switch (SourceTokenKind(input.ast, operatorKind)) {
    case "KindPlusPlusToken":
      return "++";
    case "KindMinusMinusToken":
      return "--";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindExclamationToken":
      return "!";
    default:
      return undefined;
  }
}

export function getUnaryOperatorKind(expression: { readonly Operator?: unknown; readonly OperatorToken?: Node | undefined }): unknown {
  return expression.Operator ?? expression.OperatorToken?.Kind;
}

function getStandaloneTypeofRuntimeKind(targetOperation: string): "string" | "number" | "boolean" | "bigint" | undefined {
  switch (targetOperation) {
    case "typeof:string":
      return "string";
    case "typeof:number":
      return "number";
    case "typeof:boolean":
      return "boolean";
    case "typeof:bigint":
      return "bigint";
    default:
      return undefined;
  }
}

function tryPlanTypeTestExpression(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (selectedOperator?.operationKind !== "operator" || selectedOperator.targetOperation !== "is") {
    return undefined;
  }
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (left === undefined || right === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Provider selected a type-test operation, but the expression is missing an operand."));
    return invalidExpression("selected type-test without operands");
  }
  return {
    kind: "IsPatternExpression",
    expression: planExpression(left, sourceFile, input, diagnostics),
    type: expressionToCsharpType(right, sourceFile, input, diagnostics),
  };
}

function tryPlanTypeofComparisonExpression(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (selectedOperator?.operationKind !== "operator" ||
    (!selectedOperator.targetOperation.startsWith("typeof-is:") && !selectedOperator.targetOperation.startsWith("typeof-is-not:"))) {
    return undefined;
  }
  const operand = getTypeofComparisonOperand(expression, input);
  if (operand === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Provider selected a typeof comparison operation, but the compared expression is not a typeof expression."));
    return invalidExpression("selected typeof comparison without typeof operand");
  }
  const targetKind = selectedOperator.targetOperation.slice(selectedOperator.targetOperation.indexOf(":") + 1);
  const targetType = getTypeofComparisonTargetType(targetKind);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(operand, `Provider selected unsupported typeof comparison target '${targetKind}'.`));
    return invalidExpression("selected typeof comparison target");
  }
  return {
    kind: "IsPatternExpression",
    expression: planExpression(operand, sourceFile, input, diagnostics),
    type: targetType,
    ...(selectedOperator.targetOperation.startsWith("typeof-is-not:") ? { negated: true } : {}),
  };
}

function getTypeofComparisonTargetType(kind: string): CsharpTypeNode | undefined {
  switch (kind) {
    case "string":
      return predefined("string");
    case "number":
      return predefined("double");
    case "boolean":
      return predefined("bool");
    case "bigint":
      return csharpTypeFromTargetTypeRef({ kind: "target-named", id: "System.Numerics.BigInteger" });
    default:
      return undefined;
  }
}

function getTypeofComparisonOperand(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  input: TargetCompileInput,
): Node | undefined {
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (HasSourceKind(input.ast, left, KindTypeOfExpression)) {
    return Node_Expression(left);
  }
  if (HasSourceKind(input.ast, right, KindTypeOfExpression)) {
    return Node_Expression(right);
  }
  return undefined;
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

function getBinaryLeft(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): Node | undefined {
  return expression.Left ?? (expression as { readonly left?: Node }).left;
}

function getBinaryRight(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): Node | undefined {
  return expression.Right ?? (expression as { readonly right?: Node }).right;
}

function getBinaryOperatorToken(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): unknown {
  return expression.OperatorToken?.Kind ??
    (expression as { readonly operatorToken?: { readonly Kind?: unknown } | unknown }).operatorToken ??
    (expression as { readonly Operator?: unknown; readonly operator?: unknown }).Operator ??
    (expression as { readonly operator?: unknown }).operator;
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
