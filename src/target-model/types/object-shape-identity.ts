import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  TargetTypeRef,
} from "./model.js";

export const csharpStructuralObjectShapeIdPrefix = "tsonic.shape:";

export function csharpStructuralObjectShapeIdentity(
  type: TargetTypeRef,
): string | undefined {
  return type.kind === "target-named" &&
      type.id.startsWith(csharpStructuralObjectShapeIdPrefix)
    ? type.id.slice(csharpStructuralObjectShapeIdPrefix.length)
    : undefined;
}
import {
  targetTypeRefKey,
  scopedTargetTypeRefKey,
} from "./equality.js";
import { csharpSourceMemberKeyParts } from "./source-member-keys.js";

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
  const boundNames = new Map(parameters.map((parameter, index) => [parameter.name, index]));
  return JSON.stringify([scopedTargetTypeRefKey(member.type, boundNames),
    parameters.map(parameter => parameter.constraints.map(constraint =>
      constraint.kind === "type" ? [constraint.kind, scopedTargetTypeRefKey(constraint.type, boundNames)]
        : constraint.kind === "keyword" ? [constraint.kind, constraint.keyword] : [constraint.kind])),
  ]);
}

export function csharpObjectShapeMemberContractKey(
  member: CsharpObjectShapeMemberFact,
): string {
  return JSON.stringify(csharpObjectShapeMemberContractParts(member));
}

export function csharpObjectShapeContractKey(
  shape: CsharpObjectShapeFact,
): string {
  return JSON.stringify([
    targetTypeRefKey(shape.targetType),
    String(shape.constructible),
    shape.covariantTypeParameters ?? [],
    canonicalCsharpObjectShapeImplementedTypes(shape.implements ?? [])
      .map(targetTypeRefKey),
    canonicalCsharpObjectShapeMembers(shape.members)
      .map(csharpObjectShapeMemberContractParts),
    ...(shape.members.some(member => member.methodStorageType !== undefined) ? [canonicalCsharpObjectShapeMembers(shape.members).map(member =>
      member.methodStorageType === undefined ? null : targetTypeRefKey(member.methodStorageType))] : []),
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
