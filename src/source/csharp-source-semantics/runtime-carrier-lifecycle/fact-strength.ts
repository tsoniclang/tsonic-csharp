import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isGeneratedObjectShapeCarrier,
  isSourceDeclarationCarrier,
} from "./carrier-classification.js";

export function shouldReplaceUseSiteRuntimeCarrier(existing: TargetTypeRef, replacement: TargetTypeRef): boolean {
  if (isGeneratedObjectShapeCarrier(replacement)) {
    return false;
  }
  if (isSourceDeclarationCarrier(existing) && !isSourceDeclarationCarrier(replacement)) {
    return true;
  }
  if (isBroadNumericFallback(existing) && isExplicitSourcePrimitive(replacement)) {
    return true;
  }
  return false;
}

function isBroadNumericFallback(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" && type.name === "float64";
}

function isExplicitSourcePrimitive(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" && type.name !== "float64";
}
