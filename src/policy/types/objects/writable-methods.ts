import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";

export function selectCsharpWritableMethodMembers(
  shape: CsharpObjectShapeFact,
  writtenMembers: readonly CsharpObjectShapeMemberFact[],
): readonly CsharpObjectShapeMemberFact[] | undefined {
  if (writtenMembers.length === 0) return shape.members;
  const target = shape.targetType as CsharpTargetNamedTypeRef;
  if (shape.targetType.kind !== "target-named" ||
    (target.csharpStructuralContract !== true && target.csharpSourceDeclarationKind !== "interface") ||
    writtenMembers.some(member => !shape.members.includes(member) || member.memberKind !== "method" ||
      member.readonly === true || csharpPresentObjectShapeMethod(member) === undefined)) return undefined;
  if (target.csharpStructuralContract === true && writtenMembers.every(member => member.methodValueStorage !== undefined)) return shape.members;
  return Object.freeze(shape.members.map(member => {
    if (!writtenMembers.includes(member) || member.methodValueStorage !== undefined) return member;
    const storage = Object.freeze({ type: member.optional === true ? csharpNullableTargetType(member.type) : member.type });
    return Object.freeze({ ...member, methodValueStorage: storage });
  }));
}
