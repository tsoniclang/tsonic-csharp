import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";

export function optionalAccessTargetType(
  type: TargetTypeRef | undefined,
  optionalChain: boolean,
): TargetTypeRef | undefined {
  return type === undefined || !optionalChain || isCsharpVoidTargetType(type)
    ? type
    : csharpNullableTargetType(type);
}
