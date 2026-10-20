import type { Type } from "@tsonic/tsts";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpObjectShapeMemberRetainsNativeReference } from "../../../policy/types/objects/member-reads.js";
export function resolveCsharpObjectShapeMemberReadTargetType(
  member: CsharpObjectShapeMemberFact,
  selectedSourceType: Type | undefined,
  sourceTypesAgree: (left: Type, right: Type) => boolean =
    (left, right) => left === right,
  selectedTargetType?: TargetTypeRef,
): TargetTypeRef | undefined {
  return selectedSourceType !== undefined &&
      member.sourceTypes?.some((sourceType) =>
        sourceTypesAgree(sourceType, selectedSourceType)
      ) === true
    ? csharpObjectShapeMemberRetainsNativeReference(selectedTargetType, member.type)
      ? selectedTargetType : member.type
    : undefined;
}
