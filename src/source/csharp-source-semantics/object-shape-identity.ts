import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeMemberFact,
} from "../csharp-facts.js";
import {
  csharpTargetNamedType,
} from "./target-types.js";
import {
  hashString,
  targetTypeRefKey,
} from "./target-ref-utils.js";

export function getObjectShapeTargetName(
  prefix: string,
  members: readonly CsharpObjectShapeMemberFact[],
  implementsTypes: readonly TargetTypeRef[] | undefined = undefined,
): string {
  const key = [
    ...members.map(objectShapeMemberKey).sort(),
    ...(implementsTypes ?? []).map((type) => `implements:${targetTypeRefKey(type)}`),
  ].join("|");
  return `${prefix}_${hashString(key)}`;
}

export function createObjectShapeTargetType(
  prefix: string,
  members: readonly CsharpObjectShapeMemberFact[],
  implementsTypes: readonly TargetTypeRef[] | undefined = undefined,
): TargetTypeRef {
  const targetName = getObjectShapeTargetName(prefix, members, implementsTypes);
  const typeArguments = collectObjectShapeTypeParameters(members, implementsTypes);
  return csharpTargetNamedType(
    targetName,
    typeArguments.length === 0 ? undefined : typeArguments,
    { kind: "named", name: targetName },
  );
}

function objectShapeMemberKey(member: CsharpObjectShapeMemberFact): string {
  return [
    member.sourceName,
    member.targetName,
    member.memberKind,
    member.optional === true ? "optional" : "required",
    targetTypeRefKey(member.type),
  ].join(":");
}

function collectObjectShapeTypeParameters(
  members: readonly CsharpObjectShapeMemberFact[],
  implementsTypes: readonly TargetTypeRef[] | undefined,
): readonly TargetTypeRef[] {
  const typeParameters = new Map<string, Extract<TargetTypeRef, { readonly kind: "type-parameter" }>>();
  for (const member of members) {
    collectTargetTypeParameters(member.type, typeParameters);
  }
  for (const implementsType of implementsTypes ?? []) {
    collectTargetTypeParameters(implementsType, typeParameters);
  }
  return [...typeParameters.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function collectTargetTypeParameters(
  type: TargetTypeRef,
  typeParameters: Map<string, Extract<TargetTypeRef, { readonly kind: "type-parameter" }>>,
): void {
  switch (type.kind) {
    case "type-parameter":
      typeParameters.set(type.name, type);
      return;
    case "target-named":
      for (const typeArgument of type.typeArguments ?? []) {
        collectTargetTypeParameters(typeArgument, typeParameters);
      }
      return;
    case "array":
      collectTargetTypeParameters(type.element, typeParameters);
      return;
    case "tuple":
      for (const element of type.elements) {
        collectTargetTypeParameters(element, typeParameters);
      }
      return;
    case "pointer":
      collectTargetTypeParameters(type.pointee, typeParameters);
      return;
    case "function-pointer":
      for (const argument of type.args) {
        collectTargetTypeParameters(argument, typeParameters);
      }
      collectTargetTypeParameters(type.result, typeParameters);
      return;
    case "associated-type":
      collectTargetTypeParameters(type.owner, typeParameters);
      return;
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return;
  }
}
