import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import { canonicalCsharpObjectShapeMembers } from "../../../../target-model/types/object-shape-identity.js";
import { createStructuralObjectShapeTarget } from "./construction.js";

export function parameterizeCsharpStructuralContract(shape: CsharpObjectShapeFact): CsharpObjectShapeFact {
  if (shape.targetType.kind !== "target-named" || (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true || shape.members.length === 0 ||
    shape.members.some(member => member.memberKind !== "property" || member.bound === true) ||
    (shape.implements?.length ?? 0) !== 0) return shape;
  const members = canonicalCsharpObjectShapeMembers(shape.members);
  const declaration = JSON.stringify(members.map(member => [member.sourceKey, member.optional === true,
    member.readonly === true, member.accessor ?? null]));
  const parameters: TargetTypeRef[] = members.map((_member, index) => ({ kind: "type-parameter",
    identity: JSON.stringify(["structural-property", declaration, index]), name: `Property${index}` }));
  const templateMembers: CsharpObjectShapeMemberFact[] = members.map((member, index) => ({ ...member, type: parameters[index]! }));
  const targetType = createStructuralObjectShapeTarget(templateMembers, undefined, true);
  if (targetType.kind !== "target-named") throw new Error("A nonempty structural contract lost its native interface identity.");
  const covariantTypeParameterIdentities = templateMembers.flatMap(member =>
    (member.readonly === true || member.accessor?.setter === false) && member.type.kind === "type-parameter"
      ? [member.type.identity] : []);
  const template: CsharpObjectShapeFact = { targetType, members: templateMembers, covariantTypeParameterIdentities };
  return { ...shape, targetType: { ...targetType, typeArguments: members.map(member => member.type) },
    covariantTypeParameterIdentities, declarationTemplate: template };
}
