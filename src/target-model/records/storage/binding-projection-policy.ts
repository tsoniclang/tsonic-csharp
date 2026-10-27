import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpBindingProjection {
  readonly storageCarrier: TargetTypeRef;
  readonly bindingCarrier: TargetTypeRef;
}
