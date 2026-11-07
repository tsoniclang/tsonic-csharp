import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
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
  // RC2 #6 (I4, R5): a refused Host publication is forwarded before any C# analysis, and the operand carrier the
  // caller passed was represented from that same publication; reaching either refusal here is an invariant failure,
  // never "not a generic-numeric operation" (baseline threw TSONIC_INTERNAL_ANALYSIS_INVARIANT).
  if (outcome.kind === "refused") failTargetAnalysisInvariant("tsonic-csharp",
    `A refused Host publication (${outcome.code}) of a numeric operand reached C# operator selection.`, operand);
  if (outcome.type.kind !== "declared" || !input.ast.is.IsTypeParameterDeclaration(outcome.type.declaration)) return false;
  const represented = input.types.value(operand);
  if (isCsharpRefusal(represented)) failTargetAnalysisInvariant("tsonic-csharp",
    `The C# representation of a numeric operand was refused (${represented.code}) after its carrier reached operator selection.`, operand);
  if (!targetTypeRefEquals(represented, parameter)) return false;
  const constraints = input.types.typeParameterConstraints(outcome.type.declaration, parameter);
  // A Host-refused constraint proves no INumber<T>: the operation is not generic-numeric. The operator selection result
  // carries only CSHARP_ rejections (CsharpOperationSelection), so the Host refusal is forwarded unchanged at the
  // binder's emission (declarations/type-parameters.ts), not here.
  if (constraints.kind === "refused") return false;
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
