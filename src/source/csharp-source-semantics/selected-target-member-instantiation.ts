import type {
  SelectedTargetSignatureFact,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";

export function instantiateSelectedTargetMember(selectedSignature: SelectedTargetSignatureFact): TargetMember | undefined {
  const typeArgumentMap = getSelectedTargetTypeArgumentMap(
    selectedSignature.member,
    selectedSignature.targetTypeArguments ?? [],
  );
  if (typeArgumentMap === undefined) {
    return undefined;
  }
  const instantiated = typeArgumentMap.size > 0
    ? substituteTargetMemberTypeParameters(selectedSignature.member, typeArgumentMap)
    : selectedSignature.member;
  return hasUnresolvedTargetTypeRefsFromMember(instantiated) ? undefined : instantiated;
}

function getSelectedTargetTypeArgumentMap(
  member: TargetMember,
  targetTypeArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> | undefined {
  if (targetTypeArguments.length === 0) {
    return new Map();
  }
  const typeParameters = member.typeParameters ?? [];
  if (typeParameters.length !== targetTypeArguments.length) {
    return undefined;
  }
  const typeArgumentMap = new Map<string, TargetTypeRef>();
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = targetTypeArguments[index];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    typeArgumentMap.set(parameter.name, argument);
  }
  return typeArgumentMap;
}

function hasUnresolvedTargetTypeRefsFromMember(member: TargetMember): boolean {
  return hasUnresolvedTargetTypeRef(member.declaringType) ||
    member.parameters.some((parameter) => hasUnresolvedTargetTypeRef(parameter.type)) ||
    hasUnresolvedTargetTypeRef(member.returnType);
}

function hasUnresolvedTargetTypeRef(type: TargetTypeRef | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  switch (type.kind) {
    case "type-parameter":
      return true;
    case "target-named":
      return (type.typeArguments ?? []).some(hasUnresolvedTargetTypeRef);
    case "array":
      return hasUnresolvedTargetTypeRef(type.element);
    case "tuple":
      return type.elements.some(hasUnresolvedTargetTypeRef);
    case "pointer":
      return hasUnresolvedTargetTypeRef(type.pointee);
    case "function-pointer":
      return type.args.some(hasUnresolvedTargetTypeRef) || hasUnresolvedTargetTypeRef(type.result);
    case "associated-type":
      return hasUnresolvedTargetTypeRef(type.owner);
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return false;
  }
}

function substituteTargetMemberTypeParameters(
  member: TargetMember,
  typeArgumentMap: ReadonlyMap<string, TargetTypeRef>,
): TargetMember {
  const declaringType = member.declaringType === undefined
    ? undefined
    : substituteTargetTypeRef(member.declaringType, typeArgumentMap);
  return {
    ...member,
    ...(declaringType !== undefined ? { declaringType } : {}),
    parameters: member.parameters.map((parameter) => ({
      ...parameter,
      type: substituteTargetTypeRef(parameter.type, typeArgumentMap),
    })),
    ...(member.returnType !== undefined ? { returnType: substituteTargetTypeRef(member.returnType, typeArgumentMap) } : {}),
  };
}

function substituteTargetTypeRef(type: TargetTypeRef, typeArgumentMap: ReadonlyMap<string, TargetTypeRef>): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return typeArgumentMap.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments !== undefined
          ? { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeRef(argument, typeArgumentMap)) }
          : {}),
      };
    case "array":
      return { ...type, element: substituteTargetTypeRef(type.element, typeArgumentMap) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeRef(element, typeArgumentMap)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeRef(type.pointee, typeArgumentMap) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeRef(argument, typeArgumentMap)),
        result: substituteTargetTypeRef(type.result, typeArgumentMap),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeRef(type.owner, typeArgumentMap) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}
