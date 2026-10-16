import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { TargetTypeRef } from "../../types/index.js";
import type { CsharpSourceOperator } from "../../../target-model/syntax/operators.js";
import { csharpBigIntFitsSourcePrimitive } from "../../../target-model/syntax/numeric-literals.js";

const integralResultKinds = new Set(["int32", "uint32", "int64", "uint64"]);

export function csharpIntegralConstantOperationRejection(
  input: Pick<CsharpPolicyContext, "literalValues">,
  operator: CsharpSourceOperator,
  left: Node,
  right: Node,
  types: { readonly leftInputType: TargetTypeRef; readonly rightInputType: TargetTypeRef; readonly resultType: TargetTypeRef },
): string | undefined {
  const result = types.resultType;
  if (result.kind !== "source-primitive" || !integralResultKinds.has(result.name) ||
    operator !== "+" && operator !== "-" && operator !== "*" && operator !== "/" && operator !== "%") {
    return undefined;
  }
  const leftValue = integralOperandConstant(input, left, types.leftInputType);
  const rightValue = integralOperandConstant(input, right, types.rightInputType);
  if (leftValue === undefined || rightValue === undefined) return undefined;
  if ((operator === "/" || operator === "%") && rightValue === 0n) return "Source constant expression divides by zero.";
  const value = operator === "+" ? leftValue + rightValue
    : operator === "-" ? leftValue - rightValue
    : operator === "*" ? leftValue * rightValue
    : operator === "/" ? leftValue / rightValue
    : leftValue % rightValue;
  return csharpBigIntFitsSourcePrimitive(value, result.name)
    ? undefined
    : `Source constant expression overflows the C# '${result.name}' range.`;
}

function integralOperandConstant(
  input: Pick<CsharpPolicyContext, "literalValues">,
  node: Node,
  type: TargetTypeRef,
): bigint | undefined {
  const datum = input.literalValues.literalValue.get(node);
  const value = datum?.integer ?? datum?.integerConstant ??
    (datum?.number !== undefined && Number.isInteger(datum.number) ? BigInt(datum.number) : undefined);
  return value !== undefined && type.kind === "source-primitive" && csharpBigIntFitsSourcePrimitive(value, type.name)
    ? value
    : undefined;
}
