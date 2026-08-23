import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  TargetTypeRef,
} from "./model.js";
import {
  targetTypeRefKey,
} from "./equality.js";
import { csharpSourceMemberKeyParts } from "./source-member-keys.js";

export function csharpObjectShapeMemberContractParts(
  member: CsharpObjectShapeMemberFact,
): readonly string[] {
  return [
    ...csharpSourceMemberKeyParts(member.sourceKey),
    member.targetName,
    member.memberKind,
    member.optional === true ? "optional" : "required",
    member.accessor === undefined
      ? "mutable"
      : member.accessor.setter
        ? "getter-setter"
        : "getter",
    targetTypeRefKey(member.type),
  ];
}

export function csharpObjectShapeMemberContractKey(
  member: CsharpObjectShapeMemberFact,
): string {
  return JSON.stringify(csharpObjectShapeMemberContractParts(member));
}

export function csharpObjectShapeContractKey(
  shape: CsharpObjectShapeFact,
): string {
  return JSON.stringify([
    targetTypeRefKey(shape.targetType),
    String(shape.constructible),
    canonicalCsharpObjectShapeImplementedTypes(shape.implements ?? [])
      .map(targetTypeRefKey),
    canonicalCsharpObjectShapeMembers(shape.members)
      .map(csharpObjectShapeMemberContractParts),
  ]);
}

export function canonicalCsharpObjectShapeMembers(
  members: readonly CsharpObjectShapeMemberFact[],
): readonly CsharpObjectShapeMemberFact[] {
  return [...members].sort((left, right) =>
    csharpObjectShapeMemberContractKey(left).localeCompare(
      csharpObjectShapeMemberContractKey(right),
    )
  );
}

export function canonicalCsharpObjectShapeImplementedTypes(
  types: readonly TargetTypeRef[],
): readonly TargetTypeRef[] {
  return [...types].sort((left, right) =>
    targetTypeRefKey(left).localeCompare(targetTypeRefKey(right))
  );
}
