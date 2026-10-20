import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpObjectTargetType, csharpUnitTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";

export function closeCsharpGeneratorProtocolType(
  type: TargetTypeRef,
): TargetTypeRef {
  if (type.kind === "opaque" && type.id === "unknown") {
    return csharpObjectTargetType();
  }
  return isCsharpVoidTargetType(type)
    ? csharpUnitTargetType()
    : type;
}
