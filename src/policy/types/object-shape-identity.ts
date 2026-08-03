import type {
  CsharpObjectShapeMemberFact,
  TargetTypeRef,
} from "./definitions.js";
import {
  targetTypeRefKey,
} from "./equality.js";

export function csharpObjectShapeMemberContractParts(
  member: CsharpObjectShapeMemberFact,
): readonly string[] {
  return [
    member.sourceName,
    member.targetName,
    member.memberKind,
    member.optional === true ? "optional" : "required",
    member.readonly === true ? "readonly" : "mutable",
    targetTypeRefKey(member.type),
  ];
}

export function csharpObjectShapeMemberContractKey(
  member: CsharpObjectShapeMemberFact,
): string {
  return JSON.stringify(csharpObjectShapeMemberContractParts(member));
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
