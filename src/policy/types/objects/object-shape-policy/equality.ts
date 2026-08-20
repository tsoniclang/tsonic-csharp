import { canonicalCsharpObjectShapeImplementedTypes, canonicalCsharpObjectShapeMembers } from "../object-shape-identity.js";
import { targetTypeRefEquals } from "../../model/equality.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../target-model/types/model.js";

export function csharpObjectShapesEqual(
  left: CsharpObjectShapeFact,
  right: CsharpObjectShapeFact,
): boolean {
  const leftMembers = canonicalCsharpObjectShapeMembers(left.members);
  const rightMembers = canonicalCsharpObjectShapeMembers(right.members);
  return targetTypeRefEquals(left.targetType, right.targetType) &&
    left.constructible === right.constructible &&
    targetTypeListsEqual(left.implements ?? [], right.implements ?? []) &&
    leftMembers.length === rightMembers.length &&
    leftMembers.every((member, index) => {
      const other = rightMembers[index];
      return other !== undefined &&
        member.sourceName === other.sourceName &&
        member.targetName === other.targetName &&
        member.memberKind === other.memberKind &&
        member.optional === other.optional &&
        member.accessor?.getter === other.accessor?.getter &&
        member.accessor?.setter === other.accessor?.setter &&
        targetTypeRefEquals(member.type, other.type);
    });
}

function targetTypeListsEqual(
  left: readonly TargetTypeRef[],
  right: readonly TargetTypeRef[],
): boolean {
  const canonicalLeft = canonicalCsharpObjectShapeImplementedTypes(left);
  const canonicalRight = canonicalCsharpObjectShapeImplementedTypes(right);
  return canonicalLeft.length === canonicalRight.length &&
    canonicalLeft.every((type, index) =>
      canonicalRight[index] !== undefined &&
      targetTypeRefEquals(type, canonicalRight[index]!)
    );
}
