import type { CsharpObjectMethodValueStorage, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "./model.js";

export const csharpStructuralObjectShapeIdPrefix = "tsonic.shape:";

export function csharpStructuralObjectShapeIdentity(
  type: TargetTypeRef,
): string | undefined {
  return type.kind === "target-named" &&
      type.id.startsWith(csharpStructuralObjectShapeIdPrefix)
    ? type.id.slice(csharpStructuralObjectShapeIdPrefix.length)
    : undefined;
}
import { targetTypeRefKey, scopedTargetTypeRefKey } from "./equality.js";
import { csharpSourceMemberKeyParts } from "./source-member-keys.js";
import { csharpOwnerTypeParameterConstraintKey } from "./generic-constraints.js";

export function csharpObjectShapeMemberContractParts(
  member: CsharpObjectShapeMemberFact,
): readonly string[] {
  return [
    ...csharpSourceMemberKeyParts(member.sourceKey),
    member.targetName,
    member.memberKind,
    member.optional === true ? "optional" : "required",
    member.bound === true ? "bound-location" : "value",
    member.accessor === undefined
      ? "mutable"
      : member.accessor.setter
        ? "getter-setter"
        : "getter",
    csharpObjectShapeMemberTypeKey(member),
    ...(member.exactNumericStorage === true ? ["exact-native-numeric-storage"] : []),
  ];
}

export function csharpObjectShapeMemberTypeKey(member: CsharpObjectShapeMemberFact): string {
  const parameters = member.typeParameters ?? [];
  if (parameters.length === 0) return targetTypeRefKey(member.type);
  const boundParameters = new Map(parameters.map((parameter, index) => [parameter.identity, index]));
  return JSON.stringify([scopedTargetTypeRefKey(member.type, boundParameters),
    parameters.map(parameter => parameter.constraints.map(constraint =>
      constraint.kind === "type" ? [constraint.kind, scopedTargetTypeRefKey(constraint.type, boundParameters)]
        : constraint.kind === "keyword" ? [constraint.kind, constraint.keyword] : [constraint.kind])),
  ]);
}

export function csharpObjectShapeMemberContractKey(
  member: CsharpObjectShapeMemberFact,
): string {
  return JSON.stringify(csharpObjectShapeMemberContractParts(member));
}

export function csharpObjectMethodValueStorageKey(storage: CsharpObjectMethodValueStorage | undefined): string | undefined {
  return storage === undefined ? undefined : JSON.stringify([storage.kind, targetTypeRefKey(storage.type),
    ...(storage.kind === "protocol" ? [storage.invocationName] : [])]);
}

export function csharpObjectShapeContractKey(
  shape: CsharpObjectShapeFact,
): string {
  return JSON.stringify([
    targetTypeRefKey(shape.targetType),
    csharpOwnerTypeParameterConstraintKey(shape.targetType),
    String(shape.constructible),
    shape.covariantTypeParameterIdentities ?? [],
    canonicalCsharpObjectShapeImplementedTypes(shape.implements ?? [])
      .map(targetTypeRefKey),
    canonicalCsharpObjectShapeMembers(shape.members)
      .map(csharpObjectShapeMemberContractParts),
    ...(shape.members.some(member => member.methodValueStorage !== undefined) ? [canonicalCsharpObjectShapeMembers(shape.members).map(member =>
      csharpObjectMethodValueStorageKey(member.methodValueStorage))] : []),
    ...(shape.methodImplementation === undefined ? [] : [shape.methodImplementation.identity,
      shape.methodImplementation.captures.map(capture => [capture.fieldName, targetTypeRefKey(capture.type), capture.mutable]),
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
