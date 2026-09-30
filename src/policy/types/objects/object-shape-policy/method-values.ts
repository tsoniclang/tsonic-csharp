import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import { csharpStructuralObjectShapeIdentity } from "../../../../target-model/types/object-shape-identity.js";
import type { AstReader } from "@tsonic/tsts";
import { csharpObjectShapeMethodDeclaration } from "./method-implementations.js";
import { csharpPresentObjectShapeMethod } from "../../../../target-model/types/method-values.js";

export function retainCsharpMethodValueContracts(
  shape: CsharpObjectShapeFact, remember: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact, ast: AstReader,
): CsharpObjectShapeFact {
  if (csharpStructuralObjectShapeIdentity(shape.targetType) === undefined &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return shape;
  const implemented = new Map((shape.implements ?? []).map(type => [targetTypeRefKey(type), type]));
  const members = shape.members.map(member => {
    if (member.memberKind !== "method" || (member.typeParameters?.length ?? 0) === 0 && member.optional !== true) return member;
    let contract = member.methodValueContract;
    if (contract === undefined) {
      const signature = csharpPresentObjectShapeMethod(member);
      if (signature === undefined) return member;
      contract = createStructuralObjectShapeTarget([signature], undefined, true);
      remember({ targetType: contract, members: [{ ...signature, methodValueContract: contract }] });
    }
    if (!targetTypeRefEquals(shape.targetType, contract) &&
      (member.optional !== true || csharpObjectShapeMethodDeclaration(shape, member, ast) !== undefined)) {
      implemented.set(targetTypeRefKey(contract), contract);
    }
    return { ...member, methodValueContract: contract };
  });
  return { ...shape, members, ...(implemented.size === 0 ? {} : { implements: [...implemented.values()] }) };
}

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
