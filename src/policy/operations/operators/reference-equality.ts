import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpSourceOperator } from "../../../target-model/syntax/operators.js";
import type { CsharpReferenceEquality } from "../../../target-model/operations/binary.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { namedTargetTypesAreRelated } from "../../conversions/selection/carriers.js";
import {
  getCsharpNullableElementTargetType, isCsharpStringTargetType, isCsharpValueTypeTargetType,
  targetTypeRefEquals, type TargetTypeRef,
} from "../../../target-model/types/index.js";

export function selectCsharpReferenceEquality(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpPolicyContext,
): CsharpReferenceEquality | undefined {
  if (operator !== "===" && operator !== "!==" && operator !== "==" && operator !== "!=") return undefined;
  const leftMethod = getCsharpMethodValue(left);
  const rightMethod = getCsharpMethodValue(right);
  if (leftMethod !== undefined && rightMethod !== undefined) {
    return { kind: "reference-identity", negated: operator === "!==" || operator === "!=",
      ...(leftMethod.identity === rightMethod.identity ? {} : { distinctMethodValues: true }) };
  }
  if (operator !== "===" && operator !== "!==") return undefined;
  const leftIdentity = csharpReferenceIdentityCarrier(left, input);
  const rightIdentity = csharpReferenceIdentityCarrier(right, input);
  return leftIdentity !== undefined && rightIdentity !== undefined &&
    (targetTypeRefEquals(leftIdentity, rightIdentity) ||
      input.objectShapes.resolveTarget(leftIdentity) !== undefined && input.objectShapes.resolveTarget(rightIdentity) !== undefined ||
      namedTargetTypesAreRelated(input, leftIdentity, rightIdentity))
    ? { kind: "reference-identity", negated: operator === "!==" } : undefined;
}

export function csharpReferenceIdentityCarrier(type: TargetTypeRef, input: CsharpPolicyContext): TargetTypeRef | undefined {
  const providerKind = type.kind === "target-named" ? input.providers.findTargetBindingByTargetId(type.id)?.kind : undefined;
  if (isCsharpStringTargetType(type) || isCsharpValueTypeTargetType(type) || providerKind === "enum" || providerKind === "struct") {
    return undefined;
  }
  const nullableElement = getCsharpNullableElementTargetType(type);
  const carrier = nullableElement !== undefined && !isCsharpValueTypeTargetType(nullableElement) ? nullableElement : type;
  return carrier.kind === "target-named" || carrier.kind === "array" ? carrier : undefined;
}
