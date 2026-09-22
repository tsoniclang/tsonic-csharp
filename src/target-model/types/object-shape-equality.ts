import { canonicalCsharpObjectShapeImplementedTypes, canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "./object-shape-identity.js";
import { targetTypeRefEquals } from "./equality.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "./model.js";
import { csharpSourceMemberKeysEqual } from "./source-member-keys.js";

export function csharpObjectShapesEqual(
  left: CsharpObjectShapeFact,
  right: CsharpObjectShapeFact,
): boolean {
  const leftMembers = canonicalCsharpObjectShapeMembers(left.members);
  const rightMembers = canonicalCsharpObjectShapeMembers(right.members);
  return targetTypeRefEquals(left.targetType, right.targetType) &&
    left.methodImplementation?.identity === right.methodImplementation?.identity &&
    left.methodImplementation?.declaration === right.methodImplementation?.declaration &&
    (left.methodImplementation?.captures.length ?? 0) === (right.methodImplementation?.captures.length ?? 0) &&
    (left.methodImplementation?.captures ?? []).every((capture, index) => {
      const other = right.methodImplementation?.captures[index];
      return other !== undefined && capture.declaration === other.declaration && capture.fieldName === other.fieldName &&
        capture.mutable === other.mutable && targetTypeRefEquals(capture.type, other.type);
    }) &&
    left.constructible === right.constructible &&
    targetTypeListsEqual(left.implements ?? [], right.implements ?? []) &&
    leftMembers.length === rightMembers.length &&
    leftMembers.every((member, index) => {
      const other = rightMembers[index];
      return other !== undefined &&
        csharpSourceMemberKeysEqual(member.sourceKey, other.sourceKey) &&
        member.targetName === other.targetName &&
        member.memberKind === other.memberKind &&
        member.optional === other.optional &&
        member.bound === other.bound &&
        (member.methodStorageType === undefined ? other.methodStorageType === undefined :
          other.methodStorageType !== undefined && targetTypeRefEquals(member.methodStorageType, other.methodStorageType)) &&
        (member.methodValueContract === undefined ? other.methodValueContract === undefined :
          other.methodValueContract !== undefined && targetTypeRefEquals(member.methodValueContract, other.methodValueContract)) &&
        member.accessor?.getter === other.accessor?.getter &&
        member.accessor?.setter === other.accessor?.setter &&
        csharpObjectShapeMemberContractKey(member) === csharpObjectShapeMemberContractKey(other);
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
