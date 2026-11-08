import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";

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
