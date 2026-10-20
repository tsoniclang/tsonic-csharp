import { csharpSourcePrimitiveTargetType, isCsharpIntegralTargetType, isCsharpStringTargetType, targetTypeRefEquals } from "../../types/index.js";

import type { TargetTypeRef } from "../../../target-model/types/model.js";
export function csharpSwitchCarrierSupportsNativeDispatch(type: TargetTypeRef): boolean {
  return isCsharpIntegralTargetType(type) || isCsharpStringTargetType(type) ||
    ["float32", "float64", "bool"].some(name => targetTypeRefEquals(type, csharpSourcePrimitiveTargetType(name as "float32" | "float64" | "bool")));
}
