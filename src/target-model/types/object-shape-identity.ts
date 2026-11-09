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
import type { CsharpNativeTypeIdentity } from "./equality.js";
import { csharpSourceMemberKeyParts } from "./source-member-keys.js";
import { csharpOwnerTypeParameterConstraintKey } from "./generic-constraints.js";
import { csharpNativeCallableMemberKey } from "./carriers/delegates.js";

export function csharpObjectShapeMemberContractParts(
  identity: CsharpNativeTypeIdentity,
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
    csharpObjectShapeMemberTypeKey(identity, member),
    csharpObjectMethodValueStorageKey(identity, member.methodValueStorage) ?? "",
  ];
}

export function csharpObjectShapeMemberTypeKey(identity: CsharpNativeTypeIdentity, member: CsharpObjectShapeMemberFact): string {
  const value = targetTypeRefKey(identity, member.type);
  return member.memberKind === "property" ? value : JSON.stringify([value, member.methods.map(method =>
    [csharpNativeCallableMemberKey(identity, method.member), csharpNativeCallableMemberKey(identity, method.value)])]);
}

export function csharpObjectShapeMemberContractKey(
  identity: CsharpNativeTypeIdentity,
  member: CsharpObjectShapeMemberFact,
): string {
  return JSON.stringify(csharpObjectShapeMemberContractParts(identity, member));
}

export function csharpObjectMethodValueStorageKey(identity: CsharpNativeTypeIdentity, storage: CsharpObjectMethodValueStorage | undefined): string | undefined {
  return storage === undefined ? undefined : targetTypeRefKey(identity, storage.type);
}

export function csharpObjectShapeContractKey(
  identity: CsharpNativeTypeIdentity,
  shape: CsharpObjectShapeFact,
): string {
  return JSON.stringify([
    targetTypeRefKey(identity, shape.targetType),
    csharpOwnerTypeParameterConstraintKey(identity, shape.targetType),
    shape.targetType.kind === "target-named" ? (shape.targetType as CsharpTargetNamedTypeRef).csharpCallableMembers?.map(member => csharpNativeCallableMemberKey(identity, member)) ?? [] : [],
    String(shape.constructible),
    shape.covariantTypeParameterIdentities ?? [],
    canonicalCsharpObjectShapeImplementedTypes(identity, shape.implements ?? [])
      .map(type => targetTypeRefKey(identity, type)),
    canonicalCsharpObjectShapeMembers(identity, shape.members)
      .map(member => csharpObjectShapeMemberContractParts(identity, member)),
    ...(shape.methodImplementation === undefined ? [] : [shape.methodImplementation.identity,
      shape.methodImplementation.captures.map(capture => [capture.fieldName, targetTypeRefKey(identity, capture.type), capture.mutable, capture.initialization]),
    ]),
  ]);
}

export function canonicalCsharpObjectShapeMembers(
  identity: CsharpNativeTypeIdentity,
  members: readonly CsharpObjectShapeMemberFact[],
): readonly CsharpObjectShapeMemberFact[] {
  return [...members].sort((left, right) =>
    csharpObjectShapeMemberContractKey(identity, left).localeCompare(
      csharpObjectShapeMemberContractKey(identity, right),
    )
  );
}

export function canonicalCsharpObjectShapeImplementedTypes(
  identity: CsharpNativeTypeIdentity,
  types: readonly TargetTypeRef[],
): readonly TargetTypeRef[] {
  return [...types].sort((left, right) =>
    targetTypeRefKey(identity, left).localeCompare(targetTypeRefKey(identity, right))
  );
}
