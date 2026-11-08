import type { TargetTypeRef } from "./native-type-data.js";
import type { CsharpObjectMethodValueStorage, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "./model.js";

export const csharpStructuralObjectShapeIdPrefix = "tsonic.shape:";

export function csharpStructuralObjectShapeIdentity(
  type: TargetTypeRef,
): string | undefined {
  return type.kind === "target-named" &&
      type.id.startsWith(csharpStructuralObjectShapeIdPrefix)
    ? type.id.slice(csharpStructuralObjectShapeIdPrefix.length)
    : undefined;
}
import { targetTypeRefKey } from "./equality.js";
import { csharpSourceMemberKeyParts } from "./source-member-keys.js";
import { csharpOwnerTypeParameterConstraintKey } from "./generic-constraints.js";
import { csharpNativeCallableMemberKey } from "./carriers/delegates.js";

export function csharpObjectShapeMemberContractParts(
  member: CsharpObjectShapeMemberFact,
): readonly string[] {
  return [
    ...csharpSourceMemberKeyParts(member.sourceKey),
    member.targetName,
    member.memberKind,
    member.optional === true ? "optional" : "required",
    member.readonly === true ? "readonly" : "writable",
    member.bound === true ? "bound-location" : "value",
    member.accessor === undefined
      ? "mutable"
      : member.accessor.setter
        ? "getter-setter"
        : "getter",
    csharpObjectShapeMemberTypeKey(member),
    csharpObjectMethodValueStorageKey(member.methodValueStorage) ?? "",
  ];
}

export function csharpObjectShapeMemberTypeKey(member: CsharpObjectShapeMemberFact): string {
  const value = targetTypeRefKey(member.type);
  return member.memberKind === "property" ? value : JSON.stringify([value, member.methods.map(method =>
    [csharpNativeCallableMemberKey(method.member), csharpNativeCallableMemberKey(method.value)])]);
}

export function csharpObjectShapeMemberContractKey(
  member: CsharpObjectShapeMemberFact,
): string {
  return JSON.stringify(csharpObjectShapeMemberContractParts(member));
}

export function csharpObjectMethodValueStorageKey(storage: CsharpObjectMethodValueStorage | undefined): string | undefined {
  return storage === undefined ? undefined : targetTypeRefKey(storage.type);
}

export function csharpObjectShapeContractKey(
  shape: CsharpObjectShapeFact,
): string {
  return JSON.stringify([
    targetTypeRefKey(shape.targetType),
    csharpOwnerTypeParameterConstraintKey(shape.targetType),
    shape.targetType.kind === "target-named" ? (shape.targetType as CsharpTargetNamedTypeRef).csharpCallableMembers?.map(member => csharpNativeCallableMemberKey(member)) ?? [] : [],
    String(shape.constructible),
    shape.covariantTypeParameterIdentities ?? [],
    canonicalCsharpObjectShapeImplementedTypes(shape.implements ?? [])
      .map(type => targetTypeRefKey(type)),
    canonicalCsharpObjectShapeMembers(shape.members)
      .map(csharpObjectShapeMemberContractParts),
    ...(shape.methodImplementation === undefined ? [] : [shape.methodImplementation.identity,
      shape.methodImplementation.captures.map(capture => [capture.fieldName, targetTypeRefKey(capture.type), capture.mutable, capture.initialization]),
    ]),
  ]);
}

export function canonicalCsharpObjectShapeMembers(
  members: readonly CsharpObjectShapeMemberFact[],
): readonly CsharpObjectShapeMemberFact[] {
  return [...members].sort((left, right) =>
    csharpObjectShapeMemberContractKey(left).localeCompare(
      csharpObjectShapeMemberContractKey(right),
    )
  );
}

export function canonicalCsharpObjectShapeImplementedTypes(
  types: readonly TargetTypeRef[],
): readonly TargetTypeRef[] {
  return [...types].sort((left, right) =>
    targetTypeRefKey(left).localeCompare(targetTypeRefKey(right))
  );
}
