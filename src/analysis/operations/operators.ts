import { nullishValueType } from "../../policy/operations/operators/rules.js";
import { isEquality } from "../../policy/operations/operators/operator-validation.js";
import { csharpBinaryOperationRequiresLocation } from "../../policy/operations/operators/rules.js";
import type { CsharpOperationSelection, CsharpResolvedBinaryOperation, CsharpResolvedDestructuringAssignmentOperation, CsharpResolvedUnaryOperation } from "../../target-model/records/operator-selection.js";

import { selectCsharpAssignmentLocation } from "./assignment-location.js";

import { selectCsharpGenericNumericOperation } from "./numeric/generic.js";
import { resolveCsharpContextualLiteralCarrier } from "../types/resolution/contextual-literals.js";

import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../policy/types/index.js";
import { getCsharpNullableElementTargetType, isCsharpAbsenceTargetType, targetTypeRefEquals } from "../../policy/types/index.js";

import { csharpLiteralIsRepresentableAs } from "../../policy/conversions/literals.js";

import type { CsharpSourceOperator } from "../../target-model/syntax/operators.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";
import { csharpDestructuringAssignmentSyntax } from "../../target-model/syntax/operators.js";

import { selectCsharpNativeBinaryOperation, selectCsharpNativeUnaryOperation, rejectCsharpOperator as rejected } from "../../policy/operations/operators/rules.js";
export type CsharpOperationTargetTypeQuery = (
  node: Node,
) => TargetTypeRef | undefined;

export function selectCsharpBinaryOperation(
  input: CsharpPolicyContext,
  node: Node,
  targetTypeFor: CsharpOperationTargetTypeQuery,
  expectedResultType?: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  if (!input.ast.is.IsBinaryExpression(node)) {
    return rejected("C# binary-operation policy requires a binary expression.");
  }
  const expression = input.ast.as.AsBinaryExpression(node);
  const left = expression?.Left;
  const right = expression?.Right;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (left === undefined || right === undefined || sourceOperator === undefined) {
    return rejected(
      "The checked binary expression has incomplete exact AST operator evidence.",
    );
  }
  return selectCsharpBinaryOperands(input, left, right, sourceOperator,
    targetTypeFor(node), targetTypeFor, expectedResultType);
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
  let leftType = sourceOperator === "=" || sourceOperator === "??="
    ? input.types.resolveReadStorage(left)
    : resolveBinaryOperandType(input, left, targetTypeFor);
  const nullishRightExpectation = sourceOperator === "??"
    ? expectedResultType ?? nullishValueType(leftType, input.typeDefinitions)
    : sourceOperator === "??=" ? nullishValueType(leftType, input.typeDefinitions)
    : sourceOperator === "," || sourceOperator === "&&" || sourceOperator === "||"
      ? expectedResultType ?? selectedResultType : undefined;
  let rightType = resolveBinaryOperandType(
    input,
    right,
    targetTypeFor,
    nullishRightExpectation,
  );
  const resultType = (sourceOperator === "," || sourceOperator === "&&" || sourceOperator === "||"
    ? expectedResultType ?? selectedResultType ?? (sourceOperator === "," ? rightType : undefined) : selectedResultType) ??
    (sourceOperator === "??" || sourceOperator === "??="
      ? nullishValueType(leftType, input.typeDefinitions) : undefined);
  if (leftType === undefined || rightType === undefined || resultType === undefined) {
    return rejected(
      "The checked binary expression has no closed C# representation for every operand and result.",
    );
  }
  const genericNumeric = selectCsharpGenericNumericOperation(input, sourceOperator, left, right, leftType, rightType);
  return selectCsharpNativeBinaryOperation(input, {
    left, right, sourceOperator, resultType, leftType, rightType, genericNumeric,
    leftStorage: isEquality(sourceOperator) && isCsharpAbsenceTargetType(rightType) ? input.types.resolveReadStorage(left) : undefined,
    rightStorage: isEquality(sourceOperator) && isCsharpAbsenceTargetType(leftType) ? input.types.resolveReadStorage(right) : undefined,
    resultUse: input.navigation.expressionResultUse(right),
    assignmentLocation: csharpBinaryOperationRequiresLocation(sourceOperator, leftType, rightType)
      ? selectCsharpAssignmentLocation(input, left, targetTypeFor) : "unsupported",
  }, expectedResultType);
}

export function selectCsharpDestructuringAssignmentOperation(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedDestructuringAssignmentOperation> {
  const syntax = csharpDestructuringAssignmentSyntax(input.ast, node);
  if (syntax === undefined) {
    return rejected(
      "C# destructuring-assignment policy requires an array or object binding pattern.",
    );
  }
  const sourceType = input.types.resolveNode(syntax.source, sourceFile);
  const resultType = input.types.resolveNode(node, sourceFile);
  if (
    sourceType === undefined ||
    resultType === undefined ||
    !targetTypeRefEquals(sourceType, resultType)
  ) {
    return rejected(
      "The checked destructuring assignment requires one exact C# representation for its source and result value.",
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
): TargetTypeRef | undefined {
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
    const storage = input.types.resolveReadStorage(node);
    if (getCsharpNullableElementTargetType(storage) !== undefined) return storage;
  }
  const contextual = resolveCsharpContextualLiteralCarrier(input, node, expectedType);
  if (contextual !== undefined) return contextual;
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
      csharpLiteralIsRepresentableAs(input.literalValues.literalValue.get(node), expected)
    ? expected
    : selected;
}

export function selectCsharpUnaryOperation(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedUnaryOperation> {
  const prefix = input.ast.is.IsPrefixUnaryExpression(node);
  const postfix = input.ast.is.IsPostfixUnaryExpression(node);
  if (!prefix && !postfix) {
    return rejected("C# unary-operation policy requires an update expression.");
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
    return rejected(
      "The checked update expression has incomplete exact AST operator evidence.",
    );
  }
  const update = sourceOperator === "++" || sourceOperator === "--";
  const operandType = update
    ? input.types.resolveReadStorage(operand, sourceFile)
    : input.types.resolveNode(operand, sourceFile);
  const resultType = update ? operandType : input.types.resolveNode(node, sourceFile);
  if (operandType === undefined || resultType === undefined) {
    return rejected(
      "The checked update expression has no closed C# representation for its operand and result.",
    );
  }
  return selectCsharpNativeUnaryOperation(input, sourceOperator, operand, operandType, resultType);
}
