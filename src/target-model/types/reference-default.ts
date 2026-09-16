import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { isCsharpValueTypeTargetType } from "./identity.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";

export function csharpReferenceDefaultNeedsNullableParameter(type: TargetTypeRef): boolean {
  return (type.kind === "array" || type.kind === "target-named") &&
    !isCsharpValueTypeTargetType(type) &&
    getCsharpNullableElementTargetType(type) === undefined &&
    !(type.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true);
}
