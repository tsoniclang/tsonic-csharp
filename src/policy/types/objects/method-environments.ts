import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { objectShapeMethodInvocationName, objectShapeStorageMemberName } from "../../../target-model/names/object-members.js";

export type CsharpMethodValueEnvironment =
  | { readonly kind: "delegate"; readonly type: TargetTypeRef; readonly storage: TargetTypeRef }
  | { readonly kind: "protocol"; readonly type: TargetTypeRef; readonly storage: TargetTypeRef;
      readonly invocationName: string; readonly currentSlotName: string };

export function selectCsharpMethodValueEnvironment(
  shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact,
): CsharpMethodValueEnvironment | undefined {
  if (member.memberKind !== "method") return undefined;
  if (member.methodStorageType !== undefined) {
    const type = getCsharpNullableElementTargetType(member.methodStorageType) ?? member.methodStorageType;
    return member.methodValueContract === undefined ? { kind: "delegate", type, storage: member.methodStorageType }
      : { kind: "protocol", type, storage: member.methodStorageType, invocationName: objectShapeMethodInvocationName(member),
          currentSlotName: objectShapeStorageMemberName(shape, member) };
  }
  if (member.methodValueContract === undefined) return undefined;
  const contract = (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface";
  const type = contract ? member.methodValueContract : shape.methodImplementation === undefined ? undefined : shape.targetType;
  return type === undefined ? undefined : { kind: "protocol", type,
    storage: member.optional === true ? csharpNullableTargetType(type) : type,
    invocationName: contract ? objectShapeMethodInvocationName(member) : member.targetName,
    currentSlotName: objectShapeStorageMemberName(shape, member) };
}

export function csharpCopiedObjectShapeMembers(shape: CsharpObjectShapeFact): readonly CsharpObjectShapeMemberFact[] {
  return shape.members.map(member => {
    const storage = selectCsharpMethodValueEnvironment(shape, member)?.storage;
    return storage === undefined ? member : { ...member, methodStorageType: storage };
  });
}
