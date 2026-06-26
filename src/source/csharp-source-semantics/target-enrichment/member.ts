import type {
  TargetBindingFact,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetNamedTypeRef,
} from "../target-types.js";
import type {
  CsharpTargetEnrichmentHost,
} from "./types.js";
import {
  enrichCsharpTargetTypeRef,
} from "./type-ref.js";

const targetBindingMembersByIdCache = new WeakMap<TargetBindingFact, ReadonlyMap<string, TargetMember>>();

export function enrichCsharpTargetMember(
  member: TargetMember,
  host: CsharpTargetEnrichmentHost,
  options: {
    readonly declaringTargetType?: TargetTypeRef;
    readonly methodTargetTypeArguments?: readonly TargetTypeRef[];
  } = {},
): TargetMember | undefined {
  const binding = member.declaringType?.kind === "target-named"
    ? host.getCsharpTargetBindingByTargetId(member.declaringType.id)
    : undefined;
  const bindingMember = getTargetBindingMemberById(binding, member.id);
  const selectedMember = bindingMember ?? member;
  const typeArgumentMap = createTargetTypeArgumentMap(selectedMember, binding, options);
  const substitutedMember = substituteTargetMemberTypeParameters(selectedMember, typeArgumentMap);
  const effectiveDeclaringType = substitutedMember.declaringType ?? options.declaringTargetType;
  const declaringType = enrichCsharpTargetTypeRef(effectiveDeclaringType, host);
  const returnType = enrichCsharpTargetTypeRef(substitutedMember.returnType, host);
  const parameters = enrichCsharpTargetParameters(substitutedMember.parameters, host);
  if (
    (effectiveDeclaringType !== undefined && declaringType === undefined) ||
    (substitutedMember.returnType !== undefined && returnType === undefined) ||
    parameters === undefined
  ) {
    return undefined;
  }
  return {
    ...substitutedMember,
    ...(declaringType !== undefined ? { declaringType } : {}),
    parameters,
    ...(returnType !== undefined ? { returnType } : {}),
  };
}

function getTargetBindingMemberById(
  binding: TargetBindingFact | undefined,
  memberId: string,
): TargetMember | undefined {
  if (binding?.members === undefined) {
    return undefined;
  }
  const cached = targetBindingMembersByIdCache.get(binding);
  if (cached !== undefined) {
    return cached.get(memberId);
  }
  const membersById = new Map(binding.members.map((member) => [member.id, member]));
  targetBindingMembersByIdCache.set(binding, membersById);
  return membersById.get(memberId);
}

function createTargetTypeArgumentMap(
  member: TargetMember,
  binding: TargetBindingFact | undefined,
  options: {
    readonly declaringTargetType?: TargetTypeRef;
    readonly methodTargetTypeArguments?: readonly TargetTypeRef[];
  },
): ReadonlyMap<string, TargetTypeRef> {
  const typeArgumentMap = new Map<string, TargetTypeRef>();
  const declaringTypeArguments = getMatchingDeclaringTargetTypeArguments(member, options.declaringTargetType);
  const typeParameters = binding?.typeParameters ?? [];
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = declaringTypeArguments?.[index];
    if (parameter !== undefined && argument !== undefined) {
      typeArgumentMap.set(parameter.name, argument);
    }
  }
  const methodTypeParameters = member.typeParameters ?? [];
  const methodTargetTypeArguments = options.methodTargetTypeArguments ?? [];
  for (let index = 0; index < methodTypeParameters.length; index += 1) {
    const parameter = methodTypeParameters[index];
    const argument = methodTargetTypeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      typeArgumentMap.set(parameter.name, argument);
    }
  }
  return typeArgumentMap;
}

function getMatchingDeclaringTargetTypeArguments(
  member: TargetMember,
  declaringTargetType: TargetTypeRef | undefined,
): readonly TargetTypeRef[] | undefined {
  const memberDeclaringType = member.declaringType;
  if (memberDeclaringType?.kind !== "target-named" || declaringTargetType?.kind !== "target-named") {
    return undefined;
  }
  return memberDeclaringType.id === declaringTargetType.id ? declaringTargetType.typeArguments ?? [] : undefined;
}

function enrichCsharpTargetParameters(
  parameters: readonly TargetParameter[],
  host: CsharpTargetEnrichmentHost,
): readonly TargetParameter[] | undefined {
  const enriched = parameters.map((parameter) => {
    const type = enrichCsharpTargetTypeRef(parameter.type, host);
    return type === undefined
      ? undefined
      : {
          ...parameter,
          type,
        };
  });
  return enriched.some((parameter) => parameter === undefined)
    ? undefined
    : enriched as readonly TargetParameter[];
}

function substituteTargetMemberTypeParameters(
  member: TargetMember,
  typeArgumentMap: ReadonlyMap<string, TargetTypeRef>,
): TargetMember {
  if (typeArgumentMap.size === 0) {
    return member;
  }
  const declaringType = member.declaringType === undefined
    ? undefined
    : substituteTargetTypeRef(member.declaringType, typeArgumentMap);
  const returnType = member.returnType === undefined
    ? undefined
    : substituteTargetTypeRef(member.returnType, typeArgumentMap);
  return {
    ...member,
    ...(declaringType !== undefined ? { declaringType } : {}),
    parameters: member.parameters.map((parameter) => ({
      ...parameter,
      type: substituteTargetTypeRef(parameter.type, typeArgumentMap),
    })),
    ...(returnType !== undefined ? { returnType } : {}),
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
        ...((type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType === undefined
          ? {}
          : { csharpArrayLiteralElementType: substituteTargetTypeRef((type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType!, typeArgumentMap) }),
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
