import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { isCsharpVoidTargetType } from "./identity.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "./nullable.js";
import { isCsharpJsValueTargetType } from "./runtime-carriers.js";
import { targetTypeRefEquals } from "./equality.js";

export type CsharpRuntimeParameterDefault = {
  readonly kind: "nullable" | "closed-value";
  readonly valueType: TargetTypeRef;
  readonly parameterType: TargetTypeRef;
};

export function csharpRuntimeParameterDefault(type: TargetTypeRef, incomingType?: TargetTypeRef): CsharpRuntimeParameterDefault | undefined {
  if (incomingType !== undefined) {
    return getCsharpNullableElementTargetType(type) === undefined &&
      targetTypeRefEquals(csharpNullableTargetType(type), incomingType)
      ? Object.freeze({ kind: "nullable", valueType: type, parameterType: incomingType }) : undefined;
  }
  if (isCsharpJsValueTargetType(type) && type.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true) {
    return Object.freeze({ kind: "closed-value", valueType: type, parameterType: type });
  }
  if ((type.kind === "array" || type.kind === "target-named" || type.kind === "source-primitive") &&
    !isCsharpVoidTargetType(type) &&
    getCsharpNullableElementTargetType(type) === undefined &&
    !(type.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true)) {
    return Object.freeze({ kind: "nullable", valueType: type, parameterType: csharpNullableTargetType(type) });
  }
  return undefined;
}
