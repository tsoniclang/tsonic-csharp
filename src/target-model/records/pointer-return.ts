import type { TargetTypeRef } from "../types/model.js";

export interface CsharpPointerReturnContract {
  readonly type: TargetTypeRef;
  readonly undefinedReturn: boolean;
  readonly fallthroughUndefined: boolean;
}
