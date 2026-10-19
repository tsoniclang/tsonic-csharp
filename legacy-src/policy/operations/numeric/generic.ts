import type { Node } from "@tsonic/tsts";
import { sourceIntegerLiteralValue } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { TargetTypeRef } from "../../types/index.js";
import { targetTypeRefEquals } from "../../types/index.js";
import { csharpSourceHasNumericConstraint } from "../../constraints/numeric-evidence.js";
import type { CsharpSourceOperator } from "../../../target-model/syntax/operators.js";

export function selectCsharpGenericNumericOperation(
  input: CsharpPolicyContext,
  operator: CsharpSourceOperator,
  left: Node,
  right: Node,
  leftType: TargetTypeRef,
  rightType: TargetTypeRef,
): { readonly kind: "generic-numeric"; readonly operator: string; readonly carrier: TargetTypeRef;
  readonly zeroOperand?: "left" | "right" } | undefined {
  if (!["<", "<=", ">", ">=", "==", "!=", "===", "!=="].includes(operator)) return undefined;
  const parameter = leftType.kind === "type-parameter" ? leftType
    : rightType.kind === "type-parameter" ? rightType : undefined;
  if (parameter === undefined) return undefined;
  const operand = leftType === parameter ? left : right;
  const file = input.ast.getSourceFile(operand);
  if (file === undefined || !csharpSourceHasNumericConstraint(operand, parameter, file, input)) return undefined;
  const same = targetTypeRefEquals(leftType, rightType);
  const other = leftType === parameter ? right : left;
  if (!same && sourceIntegerLiteralValue(input.ast, other) !== 0n) return undefined;
  if (same) {
    const otherFile = input.ast.getSourceFile(other);
    if (otherFile === undefined || !csharpSourceHasNumericConstraint(other, parameter, otherFile, input)) return undefined;
  }
  return { kind: "generic-numeric", operator: operator === "===" ? "==" : operator === "!==" ? "!=" : operator,
    carrier: parameter, ...(same ? {} : { zeroOperand: leftType === parameter ? "right" : "left" }) };
}
