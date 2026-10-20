import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { isCsharpStringTargetType } from "../../../target-model/types/identity.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

export function csharpObjectShapeMemberRetainsNativeReference(
  source: TargetTypeRef | undefined,
  storage: TargetTypeRef,
): boolean {
  return isCsharpStringTargetType(source) && isCsharpJsValueTargetType(storage);
}
