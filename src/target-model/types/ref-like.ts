import type { TargetTypeRef } from "./native-type-data.js";
import type { CsharpTargetNamedTypeRef } from "./model.js";

export function isCsharpRefLikeTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpByRefLike === true;
}
