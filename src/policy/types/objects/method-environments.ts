import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";

export function csharpMethodEnvironment(
  shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact,
): TargetTypeRef | undefined {
  if (member.memberKind !== "method" || member.methodValueContract === undefined) return undefined;
  return member.methodStorageType ?? ((shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface"
    ? member.methodValueContract : shape.methodImplementation === undefined ? undefined : shape.targetType);
}

export function csharpCopiedObjectShapeMembers(shape: CsharpObjectShapeFact): readonly CsharpObjectShapeMemberFact[] {
  return shape.members.map(member => {
    const storage = csharpMethodEnvironment(shape, member);
    return storage === undefined ? member : { ...member, methodStorageType: storage };
  });
}
