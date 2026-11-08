import type { CsharpObjectMethodValueStorage, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { objectShapeStorageMemberName } from "../../../target-model/names/object-members.js";

export interface CsharpMethodValueEnvironment {
  readonly type: TargetTypeRef;
  readonly storage: CsharpObjectMethodValueStorage;
  readonly currentSlotName: string;
}

export function selectCsharpMethodValueEnvironment(
  shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact,
): CsharpMethodValueEnvironment | undefined {
  if (member.memberKind !== "method" || member.methodValueStorage === undefined) return undefined;
  const storage = member.methodValueStorage;
  return { type: getCsharpNullableElementTargetType(storage.type) ?? storage.type,
    storage, currentSlotName: objectShapeStorageMemberName(shape, member) };
}

export function csharpCopiedObjectShapeMembers(shape: CsharpObjectShapeFact): readonly CsharpObjectShapeMemberFact[] {
  return shape.members.map(member => {
    if (member.memberKind !== "method" || member.methodValueStorage !== undefined) return member;
    return Object.freeze({ ...member, methodValueStorage: Object.freeze({
      type: member.optional === true ? csharpNullableTargetType(member.type) : member.type }) });
  });
}
