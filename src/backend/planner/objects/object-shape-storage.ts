import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpObjectMemberRecords } from "../../../target-model/records/objects/object-members.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function objectShapeBoundStorageTargetType(
  shape: CsharpObjectShapeFact,
  member: CsharpObjectShapeMemberFact,
  records: CsharpObjectMemberRecords,
): TargetTypeRef {
  const selected = records.objectMember.get(shape, member)?.boundStorage;
  if (selected === undefined) failCsharpPlannerInvariant("An admitted bound object field requires its selected native record storage.", member.sourceDeclarations?.[0] ?? shape.methodImplementation?.declaration);
  return selected;
}
