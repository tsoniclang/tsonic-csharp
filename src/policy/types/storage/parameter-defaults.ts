import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpTypeProjection, getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";

import type { CsharpRuntimeParameterDefault } from "../../../target-model/types/parameter-defaults.js";
export function csharpRuntimeParameterDefault(type: TargetTypeRef, incomingType?: TargetTypeRef): CsharpRuntimeParameterDefault | undefined {
  if (type.kind === "type-parameter" && csharpTypeProjection(type) === undefined && type.csharpConstraints?.kind !== "resolved") return undefined;
  if (getCsharpNullableElementTargetType(type) !== undefined) {
    return incomingType === undefined || targetTypeRefEquals(type, incomingType)
      ? Object.freeze({ kind: "nullable", valueType: type, parameterType: type }) : undefined;
  }
  if (incomingType !== undefined) {
    return targetTypeRefEquals(csharpNullableTargetType(type), incomingType)
      ? nativeDefault(type, incomingType) : undefined;
  }
  if (isCsharpJsValueTargetType(type) && type.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true) {
    return Object.freeze({ kind: "closed-value", valueType: type, parameterType: type });
  }
  if ((type.kind === "array" || type.kind === "tuple" || type.kind === "target-named" || type.kind === "source-primitive" || type.kind === "type-parameter") &&
    !isCsharpVoidTargetType(type) &&
    getCsharpNullableElementTargetType(type) === undefined &&
    !(type.kind === "target-named" && (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true)) {
    return nativeDefault(type, csharpNullableTargetType(type));
  }
  return undefined;
}

function nativeDefault(valueType: TargetTypeRef, parameterType: TargetTypeRef): CsharpRuntimeParameterDefault {
  return Object.freeze({ kind: getCsharpGenericOptionalParts(parameterType) === undefined ? "nullable" : "closed-value",
    valueType, parameterType });
}
