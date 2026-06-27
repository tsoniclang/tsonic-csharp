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
  return false;
}
