import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";

export function isTypeParameterTargetRef(
  type: TargetTypeRef | undefined,
): boolean {
  return type?.kind === "type-parameter";
}

export function isCsharpDelegateTargetRef(
  type: TargetTypeRef | undefined,
): boolean {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpDelegateSignature !== undefined;
}
