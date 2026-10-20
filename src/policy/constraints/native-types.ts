import type { TargetTypeRef } from "../../target-model/types/model.js";

import { getCsharpNullableElementTargetType, isCsharpValueTypeTargetType } from "../../target-model/types/index.js";

export function isCsharpNonNullableValueType(type: TargetTypeRef): boolean {
  return getCsharpNullableElementTargetType(type) === undefined &&
    isCsharpValueTypeTargetType(type);
}
