import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";

export function csharpMethodEnvironment(
  shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact,
): TargetTypeRef | undefined {
  if (member.memberKind !== "method") return undefined;
  if (member.methodStorageType !== undefined) return getCsharpNullableElementTargetType(member.methodStorageType) ?? member.methodStorageType;
  if (member.methodValueContract === undefined) return undefined;
  return (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface"
    ? member.methodValueContract : shape.methodImplementation === undefined ? undefined : shape.targetType;
}

export function csharpCopiedObjectShapeMembers(shape: CsharpObjectShapeFact): readonly CsharpObjectShapeMemberFact[] {
  return shape.members.map(member => {
    const storage = member.methodStorageType ?? csharpMethodEnvironment(shape, member);
    return storage === undefined ? member : { ...member, methodStorageType: storage };
  });
}
