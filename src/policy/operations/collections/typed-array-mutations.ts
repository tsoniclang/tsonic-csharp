import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../members/index.js";
import { csharpJsTypedArrayElementTargetType, type TargetTypeRef } from "../../types/index.js";
import { isCsharpAssignmentOperator, sourceOperatorFromKindName, type CsharpSourceOperator } from "../../../target-model/syntax/operators.js";
import { selectCsharpBinaryOperands, type CsharpResolvedBinaryOperation } from "../operators/operator-selection.js";
import { csharpUnaryNumericPromotion } from "../numeric/promotion.js";

export interface CsharpTypedArrayMutation {
  readonly kind: "set-typed-element";
  readonly receiver: Node;
  readonly index: Node;
  readonly value: Node;
  readonly resultType: TargetTypeRef;
  readonly calculation?: CsharpResolvedBinaryOperation;
}

export interface CsharpTypedArrayUpdate {
  readonly kind: "update-typed-element";
  readonly receiver: Node;
  readonly index: Node;
  readonly indexType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
  readonly increment: boolean;
  readonly prefix: boolean;
}

export function selectCsharpTypedArrayMutation(input: CsharpPolicyContext, node: Node, sourceFile: SourceFile):
  CsharpTypedArrayMutation | CsharpTypedArrayUpdate | { readonly kind: "rejected"; readonly reason: string } | undefined {
  const operator = sourceOperatorFromKindName(input.ast.operatorKindName(node));
  const update = operator === "++" || operator === "--";
  if (operator === undefined || (!update && !isCsharpAssignmentOperator(operator))) return undefined;
  const binary = input.ast.as.AsBinaryExpression(node);
  let left = update ? (input.ast.is.IsPrefixUnaryExpression(node)
    ? input.ast.as.AsPrefixUnaryExpression(node)?.Operand : input.ast.as.AsPostfixUnaryExpression(node)?.Operand)
    : binary?.Left;
  const value = binary?.Right;
  while (left !== undefined && input.ast.is.IsParenthesizedExpression(left)) left = input.ast.as.AsParenthesizedExpression(left)?.Expression;
  if (left === undefined || (!update && value === undefined) || !input.ast.is.IsElementAccessExpression(left)) return undefined;
  const source = input.semantics(sourceFile).operations.elementAccess(left);
  const identity = csharpSourceProfileDeclarationIdentity(input.ast, input.semantics(sourceFile), input.sourceFacts, source?.selectedDeclaration);
  if (source === undefined || identity?.owner !== "js" || identity.kind !== "indexer" || identity.declaringName !== "TypedArray") return undefined;
  const element = csharpJsTypedArrayElementTargetType(input.types.resolveNode(source.receiver.expression, sourceFile));
  if (update && element !== undefined) {
    const indexType = input.types.resolveNode(source.argument.expression, sourceFile);
    const resultType = csharpUnaryNumericPromotion(element);
    return resultType === undefined || indexType === undefined ? { kind: "rejected", reason: "Typed array updates require native numeric storage and index carriers." }
      : { kind: "update-typed-element", receiver: source.receiver.expression, index: source.argument.expression,
        indexType, resultType, increment: operator === "++", prefix: input.ast.is.IsPrefixUnaryExpression(node) };
  }
  if (value === undefined) return undefined;
  const valueType = input.types.resolveNode(value, sourceFile);
  if (element === undefined || valueType?.kind !== "source-primitive" || valueType.name === "bool" || valueType.name === "char") {
    return { kind: "rejected", reason: "Typed array writes require exact native numeric storage and value carriers." };
  }
  const calculation = operator === "=" ? undefined : selectCsharpBinaryOperands(input, left, value,
    operator.slice(0, -1) as CsharpSourceOperator, element,
    operand => operand === left ? element : input.types.resolveNode(operand, sourceFile));
  if (calculation?.kind === "rejected") return calculation;
  return { kind: "set-typed-element", receiver: source.receiver.expression, index: source.argument.expression,
    value, resultType: calculation?.resultType ?? valueType, ...(calculation === undefined ? {} : { calculation }) };
}
