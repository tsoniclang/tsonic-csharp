import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { isCsharpValueTypeTargetType } from "./identity.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "./nullable.js";
import { isCsharpJsValueTargetType } from "./runtime-carriers.js";

export type CsharpRuntimeParameterDefault = {
  readonly kind: "nullable" | "closed-value";
  readonly valueType: TargetTypeRef;
  readonly parameterType: TargetTypeRef;
};

export function csharpRuntimeParameterDefault(type: TargetTypeRef): CsharpRuntimeParameterDefault | undefined {
  if (isCsharpJsValueTargetType(type) && type.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true) {
    return Object.freeze({ kind: "closed-value", valueType: type, parameterType: type });
  }
  if ((type.kind === "array" || type.kind === "target-named") &&
    !isCsharpValueTypeTargetType(type) &&
    getCsharpNullableElementTargetType(type) === undefined &&
    !(type.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true)) {
    return Object.freeze({ kind: "nullable", valueType: type, parameterType: csharpNullableTargetType(type) });
  }
  return undefined;
}
