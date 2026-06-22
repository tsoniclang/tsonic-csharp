import type {
  TargetBindingFact,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  type CsharpTargetNamedTypeRef,
  csharpRenderShapeForTargetNamedType,
  csharpTargetNamedType,
  csharpTargetTypeFromBinding,
} from "./target-types.js";

export interface CsharpTargetEnrichmentHost {
  readonly getCsharpTargetBindingByTargetId: (targetId: string) => TargetBindingFact | undefined;
}

export function getCsharpTargetTypeFromBinding(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[],
  host: CsharpTargetEnrichmentHost,
): TargetTypeRef | undefined {
  const enrichedBinding = binding.target === "csharp"
    ? host.getCsharpTargetBindingByTargetId(binding.id) ?? binding
    : binding;
  return csharpTargetTypeFromBinding(enrichedBinding, typeArguments);
}

export function enrichCsharpTargetTypeRef(
  type: TargetTypeRef | undefined,
  host: CsharpTargetEnrichmentHost,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  switch (type.kind) {
    case "source-primitive":
    case "type-parameter":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
    case "target-named": {
      const typeArguments = enrichCsharpTargetTypeRefs(type.typeArguments ?? [], host);
      if (typeArguments === undefined) {
        return undefined;
      }
      const binding = host.getCsharpTargetBindingByTargetId(type.id);
      if (binding !== undefined) {
        return preserveCsharpTargetNamedMetadata(
          csharpTargetTypeFromBinding(binding, typeArguments),
          type,
          host,
        );
      }
      const known = csharpTargetNamedType(type.id, typeArguments);
      const candidate = {
        ...known,
        ...type,
        ...(typeArguments.length > 0 ? { typeArguments } : {}),
      };
      return csharpRenderShapeForTargetNamedType(candidate) === undefined ? undefined : candidate;
    }
    case "array": {
      const element = enrichCsharpTargetTypeRef(type.element, host);
      return element === undefined
        ? undefined
        : {
            ...type,
            element,
          };
    }
    case "tuple": {
      const elements = enrichCsharpTargetTypeRefs(type.elements, host);
      return elements === undefined
        ? undefined
        : {
            ...type,
            elements,
          };
    }
    case "pointer": {
      const pointee = enrichCsharpTargetTypeRef(type.pointee, host);
      return pointee === undefined
        ? undefined
        : {
            ...type,
            pointee,
          };
    }
    case "function-pointer": {
      const args = enrichCsharpTargetTypeRefs(type.args, host);
      const result = enrichCsharpTargetTypeRef(type.result, host);
      return args === undefined || result === undefined
        ? undefined
        : {
            ...type,
            args,
            result,
          };
    }
    case "associated-type": {
      const owner = enrichCsharpTargetTypeRef(type.owner, host);
      return owner === undefined
        ? undefined
        : {
            ...type,
            owner,
          };
    }
  }
}

function preserveCsharpTargetNamedMetadata(
  enriched: TargetTypeRef | undefined,
  original: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  host: CsharpTargetEnrichmentHost,
): TargetTypeRef | undefined {
  if (enriched?.kind !== "target-named") {
    return enriched;
  }
  const arrayLiteralElementType = (original as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType;
  if (arrayLiteralElementType === undefined) {
    return enriched;
  }
  const enrichedArrayLiteralElementType = enrichCsharpTargetTypeRef(arrayLiteralElementType, host);
  if (enrichedArrayLiteralElementType === undefined) {
    return enriched;
  }
  const preserved = {
    ...enriched,
    csharpArrayLiteralElementType: enrichedArrayLiteralElementType,
  } satisfies CsharpTargetNamedTypeRef;
  return preserved;
}

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
  const bindingMember = binding?.members?.find((candidate) => candidate.id === member.id);
  const selectedMember = bindingMember ?? member;
  const typeArgumentMap = createTargetTypeArgumentMap(selectedMember, binding, options);
  const substitutedMember = substituteTargetMemberTypeParameters(selectedMember, typeArgumentMap);
  const declaringType = enrichCsharpTargetTypeRef(substitutedMember.declaringType, host);
  const returnType = enrichCsharpTargetTypeRef(substitutedMember.returnType, host);
  const parameters = enrichCsharpTargetParameters(substitutedMember.parameters, host);
  if (
    (substitutedMember.declaringType !== undefined && declaringType === undefined) ||
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

function enrichCsharpTargetTypeRefs(
  types: readonly TargetTypeRef[],
  host: CsharpTargetEnrichmentHost,
): readonly TargetTypeRef[] | undefined {
  const enriched = types.map((type) => enrichCsharpTargetTypeRef(type, host));
  return enriched.some((type) => type === undefined)
    ? undefined
    : enriched as readonly TargetTypeRef[];
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
