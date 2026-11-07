import type { Node } from "@tsonic/tsts";
import { sourceIntegerLiteralValue } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { TargetTypeRef } from "../../../policy/types/index.js";
import { targetTypeRefEquals } from "../../../policy/types/index.js";
import { isCsharpRefusal } from "../../../representation/index.js";
import type { CsharpSourceOperator } from "../../../target-model/syntax/operators.js";

/**
 * The operand is a value of a generic binder `T` whose C# constraints include `INumber<T>`: its published value type is
 * the binder itself (Host descriptor `declared` on a type parameter), it represents as that C# type parameter, and the
 * binder's C# constraints (from the Host descriptors of its authored constraint parts) contain `INumber<T>`.
 */
function csharpOperandHasNumericConstraint(input: CsharpPolicyContext, operand: Node,
  parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>): boolean {
  const outcome = input.facts.values.type(operand);
  if (outcome.kind === "refused" || outcome.type.kind !== "declared" ||
    !input.ast.is.IsTypeParameterDeclaration(outcome.type.declaration)) return false;
  const represented = input.types.value(operand);
  if (isCsharpRefusal(represented) || !targetTypeRefEquals(represented, parameter)) return false;
  const constraints = input.types.typeParameterConstraints(outcome.type.declaration, parameter);
  return constraints.kind === "resolved" && constraints.constraints.some(constraint =>
    constraint.kind === "type" && constraint.type.kind === "target-named" &&
    constraint.type.id === "System.Numerics.INumber`1" &&
    constraint.type.typeArguments?.[0] !== undefined &&
    targetTypeRefEquals(constraint.type.typeArguments[0], parameter));
}

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
  if (!csharpOperandHasNumericConstraint(input, operand, parameter)) return undefined;
  const same = targetTypeRefEquals(leftType, rightType);
  const other = leftType === parameter ? right : left;
  if (!same && sourceIntegerLiteralValue(input.ast, other) !== 0n) return undefined;
  if (same && !csharpOperandHasNumericConstraint(input, other, parameter)) return undefined;
  return { kind: "generic-numeric", operator: operator === "===" ? "==" : operator === "!==" ? "!=" : operator,
    carrier: parameter, ...(same ? {} : { zeroOperand: leftType === parameter ? "right" : "left" }) };
}
