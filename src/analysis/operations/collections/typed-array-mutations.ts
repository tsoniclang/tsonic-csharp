import type { CsharpTypedArrayMutation, CsharpTypedArrayUpdate } from "../../../target-model/records/storage/typed-array-mutations.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { csharpJsTypedArrayElementTargetType } from "../../../policy/types/index.js";
import { isCsharpAssignmentOperator, sourceOperatorFromKindName, type CsharpSourceOperator } from "../../../target-model/syntax/operators.js";
import { selectCsharpBinaryOperands } from "../operators.js";

import { selectCsharpNativeTypedArrayUpdate, csharpTypedArrayWriteHasNativeCarriers } from "../../../policy/operations/collections/typed-array-mutations.js";
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
  const element = csharpJsTypedArrayElementTargetType(input.types.resolveNode(source.receiver.expression, sourceFile)?.type);
  if (update && element !== undefined) {
    const indexType = input.types.resolveNode(source.argument.expression, sourceFile)?.type;
    return selectCsharpNativeTypedArrayUpdate(element, indexType, source.receiver.expression,
      source.argument.expression, operator === "++", input.ast.is.IsPrefixUnaryExpression(node));
  }
  if (value === undefined) return undefined;
  const valueType = input.types.resolveNode(value, sourceFile)?.type;
  if (!csharpTypedArrayWriteHasNativeCarriers(element, valueType)) {
    return { kind: "rejected", reason: "Typed array writes require exact native numeric storage and value carriers." };
  }
  const calculation = operator === "=" ? undefined : selectCsharpBinaryOperands(input, left, value,
    operator.slice(0, -1) as CsharpSourceOperator, element,
    operand => operand === left ? element : input.types.resolveNode(operand, sourceFile)?.type);
  if (calculation?.kind === "rejected") return calculation;
  return { kind: "set-typed-element", receiver: source.receiver.expression, index: source.argument.expression,
    value, resultType: calculation?.resultType ?? valueType!, ...(calculation === undefined ? {} : { calculation }) };
}
