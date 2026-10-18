import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { isCsharpVoidTargetType } from "./identity.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "./carriers/nullable.js";
import { isCsharpJsValueTargetType } from "./carriers/runtime-carriers.js";

export type CsharpRuntimeParameterDefault = {
  readonly kind: "nullable" | "closed-value";
  readonly valueType: TargetTypeRef;
  readonly parameterType: TargetTypeRef;
};

export function csharpRuntimeParameterDefault(type: TargetTypeRef, incomingType?: TargetTypeRef): CsharpRuntimeParameterDefault | undefined {
  if (incomingType !== undefined) return (type.kind === "array" || type.kind === "tuple" ||
    type.kind === "target-named" || type.kind === "source-primitive") && !isCsharpVoidTargetType(type)
    ? Object.freeze({ kind: getCsharpNullableElementTargetType(incomingType) === undefined ? "closed-value" : "nullable",
        valueType: type, parameterType: incomingType }) : undefined;
  if (getCsharpNullableElementTargetType(type) !== undefined) {
    return Object.freeze({ kind: "nullable", valueType: type, parameterType: type });
  }
  if (isCsharpJsValueTargetType(type) && type.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true) {
    return Object.freeze({ kind: "closed-value", valueType: type, parameterType: type });
  }
  if ((type.kind === "array" || type.kind === "tuple" || type.kind === "target-named" || type.kind === "source-primitive") &&
    !isCsharpVoidTargetType(type) &&
    getCsharpNullableElementTargetType(type) === undefined &&
    !(type.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true)) {
    return Object.freeze({ kind: "nullable", valueType: type, parameterType: csharpNullableTargetType(type) });
  }
  return undefined;
}
