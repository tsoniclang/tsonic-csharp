import type { TargetTypeRef } from "../../types/native-type-data.js";

export interface CsharpPointerReturnContract {
  readonly type: TargetTypeRef;
  readonly undefinedReturn: boolean;
  readonly fallthroughUndefined: boolean;
}
