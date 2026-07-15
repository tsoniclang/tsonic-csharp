import type {
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../target-types.js";
import {
  csharpTargetBindingFact,
  substituteTargetTypeParameters as substituteTargetTypeRef,
} from "../target-types.js";
import type {
  CsharpTargetEnrichmentHost,
} from "./types.js";
import {
  enrichCsharpTargetTypeRef,
} from "./type-ref.js";

const targetBindingMembersByIdCache = new WeakMap<TargetBindingFact, ReadonlyMap<string, CsharpTargetMember>>();

export function enrichCsharpTargetMember(
  member: CsharpTargetMember,
  host: CsharpTargetEnrichmentHost,
  options: {
    readonly declaringTargetType?: TargetTypeRef;
    readonly methodTargetTypeArguments?: readonly TargetTypeRef[];
    readonly preserveSelectedMember?: boolean;
  } = {},
): CsharpTargetMember | undefined {
  const binding = member.declaringType?.kind === "target-named"
    ? host.getCsharpTargetBindingByTargetId(member.declaringType.id)
    : undefined;
  const bindingMember = getTargetBindingMemberById(csharpTargetBindingFact(binding), member.id);
  const selectedMember = options.preserveSelectedMember === true ? member : bindingMember ?? member;
  const typeArgumentMap = createTargetTypeArgumentMap(selectedMember, csharpTargetBindingFact(binding), options);
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
  binding: ReturnType<typeof csharpTargetBindingFact>,
  memberId: string,
): CsharpTargetMember | undefined {
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
  member: CsharpTargetMember,
  binding: CsharpTargetBindingFact | undefined,
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
  member: CsharpTargetMember,
  declaringTargetType: TargetTypeRef | undefined,
): readonly TargetTypeRef[] | undefined {
  const memberDeclaringType = member.declaringType;
  if (memberDeclaringType?.kind !== "target-named" || declaringTargetType?.kind !== "target-named") {
    return undefined;
  }
  return memberDeclaringType.id === declaringTargetType.id ? declaringTargetType.typeArguments ?? [] : undefined;
}

function enrichCsharpTargetParameters(
  parameters: readonly CsharpTargetParameter[],
  host: CsharpTargetEnrichmentHost,
): readonly CsharpTargetParameter[] | undefined {
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
    : enriched as readonly CsharpTargetParameter[];
}

function substituteTargetMemberTypeParameters(
  member: CsharpTargetMember,
  typeArgumentMap: ReadonlyMap<string, TargetTypeRef>,
): CsharpTargetMember {
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
