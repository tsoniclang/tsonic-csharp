import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";

export function isCsharpRefLikeTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpByRefLike === true;
}
