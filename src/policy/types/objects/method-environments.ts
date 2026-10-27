import type { CsharpObjectMethodValueStorage, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { objectShapeMethodInvocationName, objectShapeStorageMemberName } from "../../../target-model/names/object-members.js";

export type CsharpMethodValueEnvironment =
  | { readonly kind: "delegate"; readonly type: TargetTypeRef; readonly storage: CsharpObjectMethodValueStorage }
  | { readonly kind: "protocol"; readonly type: TargetTypeRef; readonly storage: CsharpObjectMethodValueStorage;
      readonly invocationName: string; readonly currentSlotName: string };

export function selectCsharpMethodValueEnvironment(
  shape: CsharpObjectShapeFact, member: CsharpObjectShapeMemberFact,
): CsharpMethodValueEnvironment | undefined {
  if (member.memberKind !== "method") return undefined;
  if (member.methodValueStorage !== undefined) {
    const storage = member.methodValueStorage;
    const type = getCsharpNullableElementTargetType(storage.type) ?? storage.type;
    return storage.kind === "delegate" ? { kind: "delegate", type, storage }
      : { kind: "protocol", type, storage, invocationName: storage.invocationName,
          currentSlotName: objectShapeStorageMemberName(shape, member) };
  }
  if (member.methodValueContract === undefined) return undefined;
  const contract = (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface";
  const type = contract ? member.methodValueContract : shape.methodImplementation === undefined ? undefined : shape.targetType;
  const invocationName = contract ? objectShapeMethodInvocationName(member) : member.targetName;
  return type === undefined ? undefined : { kind: "protocol", type,
    storage: { kind: "protocol", type: member.optional === true ? csharpNullableTargetType(type) : type, invocationName },
    invocationName,
    currentSlotName: objectShapeStorageMemberName(shape, member) };
}

export function csharpCopiedObjectShapeMembers(shape: CsharpObjectShapeFact): readonly CsharpObjectShapeMemberFact[] {
  return shape.members.map(member => {
    if (shape.methodImplementation === undefined && member.memberKind === "method" &&
      member.methodValueContract !== undefined && member.methodValueStorage === undefined) return {
        ...member, methodValueStorage: Object.freeze({ kind: "protocol" as const,
          type: member.optional === true ? csharpNullableTargetType(member.methodValueContract) : member.methodValueContract,
          invocationName: objectShapeMethodInvocationName(member) }),
      };
    const storage = selectCsharpMethodValueEnvironment(shape, member)?.storage;
    return storage === undefined ? member : { ...member, methodValueStorage: storage };
  });
}
