import type { CsharpTypedArrayMutation, CsharpTypedArrayUpdate } from "../../../target-model/records/storage/typed-array-mutations.js";
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { selectCsharpJsIndexer } from "./js-indexers.js";
import { csharpJsTypedArrayElementTargetType } from "../../../policy/types/index.js";
import { isCsharpAssignmentOperator, sourceOperatorFromKindName, type CsharpSourceOperator } from "../../../target-model/syntax/operators.js";
import { selectCsharpBinaryOperands } from "../operators.js";

import { selectCsharpNativeTypedArrayUpdate, csharpTypedArrayWriteHasNativeCarriers } from "../../../policy/operations/collections/typed-array-mutations.js";

const represented = (input: CsharpPolicyContext, node: Node): TargetTypeRef | undefined => {
  const value = input.types.value(node);
  return value.kind === "csharp-refused" ? undefined : value;
};

/** A write or update of a JS typed-array element (Host element access selects the TypedArray indexer). */
export function selectCsharpTypedArrayMutation(input: CsharpPolicyContext, node: Node):
  CsharpTypedArrayMutation | CsharpTypedArrayUpdate | { readonly kind: "rejected"; readonly reason: string; readonly code: `CSHARP_${string}` } | undefined {
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
  const source = input.facts.values.elementAccess(left);
  if (selectCsharpJsIndexer(input, source) !== "TypedArray") return undefined;
  const index = input.ast.as.AsElementAccessExpression(left)?.ArgumentExpression ?? failTargetAnalysisInvariant("tsonic-csharp",
    "An element access has no index expression.", left);
  const element = csharpJsTypedArrayElementTargetType(represented(input, source.receiver));
  if (update && element !== undefined) {
    const indexType = represented(input, index);
    return selectCsharpNativeTypedArrayUpdate(element, indexType, source.receiver,
      index, operator === "++", input.ast.is.IsPrefixUnaryExpression(node));
  }
  if (value === undefined) return undefined;
  const valueType = represented(input, value);
  if (!csharpTypedArrayWriteHasNativeCarriers(element, valueType)) {
    return { kind: "rejected", reason: "Typed array writes require exact native numeric storage and value carriers.",
      code: "CSHARP_TYPED_ARRAY_MUTATION_NOT_PROVEN" };
  }
  const calculation = operator === "=" ? undefined : selectCsharpBinaryOperands(input, left, value,
    operator.slice(0, -1) as CsharpSourceOperator, element,
    operand => operand === left ? element : represented(input, operand));
  if (calculation?.kind === "rejected") return calculation;
  return { kind: "set-typed-element", receiver: source.receiver, index,
    value, resultType: calculation?.resultType ?? valueType!, ...(calculation === undefined ? {} : { calculation }) };
}
