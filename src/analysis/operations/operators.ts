import { nullishValueType } from "../../policy/operations/operators/rules.js";
import { isEquality } from "../../policy/operations/operators/operator-validation.js";
import { csharpBinaryOperationRequiresLocation } from "../../policy/operations/operators/rules.js";
import type { CsharpOperationSelection, CsharpResolvedBinaryOperation, CsharpResolvedDestructuringAssignmentOperation, CsharpResolvedUnaryOperation } from "../../target-model/records/operations/operator-selection.js";

import { selectCsharpAssignmentLocation } from "./assignment-location.js";

import { selectCsharpGenericNumericOperation } from "./numeric/generic.js";

import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../policy/types/index.js";
import { getCsharpNullableElementTargetType, isCsharpAbsenceTargetType, targetTypeRefEquals } from "../../policy/types/index.js";
import { isCsharpRefusal, type CsharpRefusal, type CsharpRepresentation } from "../../representation/index.js";

import { csharpLiteralIsRepresentableAs } from "../../policy/conversions/literals.js";

import type { CsharpSourceOperator } from "../../target-model/syntax/operators.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";
import { csharpDestructuringAssignmentSyntax } from "../../target-model/syntax/operators.js";

import { selectCsharpNativeBinaryOperation, selectCsharpNativeUnaryOperation, rejectCsharpOperator as rejected } from "../../policy/operations/operators/rules.js";
export type CsharpOperationTargetTypeQuery = (
  node: Node,
) => TargetTypeRef | undefined;

/** A represented operand or result: its carrier, the CSHARP_ refusal that stops the operation, or no carrier. */
type CsharpOperandCarrier = TargetTypeRef | CsharpRefusal | undefined;

/** A .NET representation refusal stops the operation and is reported as is (code, message). */
function refusedRepresentation(refusal: CsharpRefusal): { readonly kind: "rejected"; readonly reason: string; readonly code: CsharpRefusal["code"] } {
  return Object.freeze({ kind: "rejected", reason: refusal.message, code: refusal.code });
}

/** The published value outcome of an operation node; a Host refusal never reaches C# analysis. */
function publishedOutcome(input: CsharpPolicyContext, node: Node) {
  const outcome = input.facts.values.type(node);
  return outcome.kind === "refused" ? failTargetAnalysisInvariant("tsonic-csharp",
    "An operator value type is a Host refusal; Host refusals are forwarded before C# analysis.", node) : outcome;
}

export function selectCsharpBinaryOperation(
  input: CsharpPolicyContext,
  node: Node,
  targetTypeFor: CsharpOperationTargetTypeQuery,
  expectedResultType?: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  if (!input.ast.is.IsBinaryExpression(node)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "C# binary-operation policy requires a binary expression.", node);
  }
  const expression = input.ast.as.AsBinaryExpression(node);
  const left = expression?.Left;
  const right = expression?.Right;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (left === undefined || right === undefined || sourceOperator === undefined) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "The checked binary expression has incomplete exact AST operator evidence.", node);
  }
  const construction = publishedOutcome(input, node).construction;
  const resultType: CsharpRepresentation | undefined = construction === undefined ? targetTypeFor(node)
    : input.types.represent(construction, node, "value");
  if (resultType !== undefined && isCsharpRefusal(resultType)) return refusedRepresentation(resultType);
  return selectCsharpBinaryOperands(input, left, right, sourceOperator,
    resultType, targetTypeFor, expectedResultType);
}

export function selectCsharpBinaryOperands(
  input: CsharpPolicyContext,
  left: Node,
  right: Node,
  sourceOperator: CsharpSourceOperator,
  selectedResultType: TargetTypeRef | undefined,
  targetTypeFor: CsharpOperationTargetTypeQuery,
  expectedResultType?: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  const leftStorage: CsharpOperandCarrier = sourceOperator === "??" ? input.types.readStorage(left) : undefined;
  const leftCarrier: CsharpOperandCarrier = sourceOperator === "=" || sourceOperator === "??="
    ? input.types.readStorage(left)
    : leftStorage ?? resolveBinaryOperandType(input, left, targetTypeFor);
  if (leftCarrier !== undefined && isCsharpRefusal(leftCarrier)) return refusedRepresentation(leftCarrier);
  const leftType = leftCarrier;
  const nullishRightExpectation = sourceOperator === "??"
    ? expectedResultType ?? nullishValueType(leftType, input.typeDefinitions)
    : sourceOperator === "??=" ? nullishValueType(leftType, input.typeDefinitions)
    : sourceOperator === "," || sourceOperator === "&&" || sourceOperator === "||"
      ? expectedResultType ?? selectedResultType : undefined;
  const rightCarrier = resolveBinaryOperandType(
    input,
    right,
    targetTypeFor,
    nullishRightExpectation,
  );
  if (rightCarrier !== undefined && isCsharpRefusal(rightCarrier)) return refusedRepresentation(rightCarrier);
  const rightType = rightCarrier;
  const resultType = selectedResultType;
  if (leftType === undefined || rightType === undefined || resultType === undefined) {
    return rejected(
      "The checked binary expression has no closed C# representation for every operand and result.",
      "CSHARP_OPERAND_NOT_REPRESENTABLE",
    );
  }
  const leftEqualityStorage = isEquality(sourceOperator) && isCsharpAbsenceTargetType(rightType) ? input.types.readStorage(left) : undefined;
  const rightEqualityStorage = isEquality(sourceOperator) && isCsharpAbsenceTargetType(leftType) ? input.types.readStorage(right) : undefined;
  if (leftEqualityStorage !== undefined && isCsharpRefusal(leftEqualityStorage)) return refusedRepresentation(leftEqualityStorage);
  if (rightEqualityStorage !== undefined && isCsharpRefusal(rightEqualityStorage)) return refusedRepresentation(rightEqualityStorage);
  const genericNumeric = selectCsharpGenericNumericOperation(input, sourceOperator, left, right, leftType, rightType);
  return selectCsharpNativeBinaryOperation(input, {
    left, right, sourceOperator, resultType, leftType, rightType, genericNumeric,
    leftStorage: leftEqualityStorage,
    rightStorage: rightEqualityStorage,
    resultUse: sourceOperator === "," ? input.facts.navigation.expressions.resultUse(right) : undefined,
    assignmentLocation: csharpBinaryOperationRequiresLocation(sourceOperator, leftType, rightType)
      ? selectCsharpAssignmentLocation(input, left, targetTypeFor) : "unsupported",
  });
}

export function selectCsharpDestructuringAssignmentOperation(
  input: CsharpPolicyContext,
  node: Node,
): CsharpOperationSelection<CsharpResolvedDestructuringAssignmentOperation> {
  const syntax = csharpDestructuringAssignmentSyntax(input.ast, node);
  if (syntax === undefined) {
    return rejected(
      "C# destructuring-assignment policy requires an array or object binding pattern.",
      "CSHARP_DESTRUCTURING_ASSIGNMENT_PATTERN",
    );
  }
  const sourceType = input.types.value(syntax.source);
  if (isCsharpRefusal(sourceType)) return refusedRepresentation(sourceType);
  const resultType = input.types.value(node);
  if (isCsharpRefusal(resultType)) return refusedRepresentation(resultType);
  if (!targetTypeRefEquals(sourceType, resultType)) {
    return rejected(
      "The checked destructuring assignment requires one exact C# representation for its source and result value.",
      "CSHARP_DESTRUCTURING_CARRIER_MISMATCH",
    );
  }
  return {
    kind: "resolved",
    sourceOperator: "=",
    targetOperation: { kind: "operator", operator: "=" },
    pattern: syntax.pattern,
    source: syntax.source,
    sourceType,
    resultType,
  };
}

function resolveBinaryOperandType(
  input: CsharpPolicyContext,
  node: Node,
  targetTypeFor: CsharpOperationTargetTypeQuery,
  expectedType?: TargetTypeRef,
): CsharpOperandCarrier {
  if (input.ast.is.IsBinaryExpression(node)) {
    const nested = selectCsharpBinaryOperation(
      input,
      node,
      targetTypeFor,
      expectedType,
    );
    if (nested.kind === "resolved") {
      return nested.resultType;
    }
  }
  const selected = targetTypeFor(node);
  if (isCsharpAbsenceTargetType(selected)) {
    const storage = input.types.readStorage(node);
    if (isCsharpRefusal(storage)) return storage;
    if (getCsharpNullableElementTargetType(storage) !== undefined) return storage;
  }
  return adaptLiteralToExpectedType(input, node, selected, expectedType);
}

function adaptLiteralToExpectedType(
  input: CsharpPolicyContext,
  node: Node,
  selected: TargetTypeRef | undefined,
  expected: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return selected !== undefined &&
      expected !== undefined &&
      csharpLiteralIsRepresentableAs(input.facts.values.literal(node), expected, input.facts.analyses.platform)
    ? expected
    : selected;
}

export function selectCsharpUnaryOperation(
  input: CsharpPolicyContext,
  node: Node,
): CsharpOperationSelection<CsharpResolvedUnaryOperation> {
  const prefix = input.ast.is.IsPrefixUnaryExpression(node);
  const postfix = input.ast.is.IsPostfixUnaryExpression(node);
  if (!prefix && !postfix) {
    return failTargetAnalysisInvariant("tsonic-csharp", "C# unary-operation policy requires a unary expression.", node);
  }
  const operand = prefix
    ? input.ast.as.AsPrefixUnaryExpression(node)?.Operand
    : input.ast.as.AsPostfixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (
    operand === undefined ||
    (
      sourceOperator !== "!" &&
      sourceOperator !== "~" &&
      sourceOperator !== "+" &&
      sourceOperator !== "-" &&
      sourceOperator !== "++" &&
      sourceOperator !== "--"
    )
  ) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "The checked unary expression has incomplete exact AST operator evidence.", node);
  }
  const update = sourceOperator === "++" || sourceOperator === "--";
  // A signed numeric literal (`-1`) is typed by its published physical construction, not by its operand.
  const outcome = publishedOutcome(input, node);
  const literal = prefix && (sourceOperator === "+" || sourceOperator === "-") &&
    input.facts.values.literal(node) !== undefined;
  const literalCarrier = literal ? input.types.represent(outcome.construction ?? outcome.type, node, "value") : undefined;
  const operandType = literalCarrier ?? (update ? input.types.readStorage(operand) : input.types.value(operand));
  const resultType = literalCarrier ?? (update ? operandType : input.types.value(node));
  if (isCsharpRefusal(operandType)) return refusedRepresentation(operandType);
  if (isCsharpRefusal(resultType)) return refusedRepresentation(resultType);
  return selectCsharpNativeUnaryOperation(input, sourceOperator, operand, operandType, resultType);
}
