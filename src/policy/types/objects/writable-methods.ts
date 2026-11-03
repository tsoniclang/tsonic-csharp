import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { objectShapeMethodInvocationName } from "../../../target-model/names/object-members.js";

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
    if ((member.typeParameters?.length ?? 0) === 0 && member.methodValueContract === undefined) {
      return Object.freeze({ ...member, methodValueStorage: Object.freeze({ kind: "delegate" as const,
        type: member.optional === true ? csharpNullableTargetType(member.type) : member.type }) });
    }
    const contract = member.methodValueContract;
    const storage = contract === undefined
      ? Object.freeze({ kind: "delegate" as const, type: member.type })
      : Object.freeze({ kind: "protocol" as const,
          type: member.optional === true ? csharpNullableTargetType(contract) : contract,
          invocationName: objectShapeMethodInvocationName(member) });
    return Object.freeze({ ...member, methodValueStorage: storage });
  }));
}
