import type { TargetTypeRef } from "../types/model.js";

export interface CsharpSourceCallResult {
  readonly nativeType: TargetTypeRef;
  readonly selectedType: TargetTypeRef;
}
