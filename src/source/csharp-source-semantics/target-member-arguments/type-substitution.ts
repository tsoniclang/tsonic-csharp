import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../target-types.js";
import {
  substituteTargetTypeParameters as substituteTargetTypeRef,
} from "../target-types/substitution.js";
import {
  targetTypeRefEquals,
} from "../target-ref-utils.js";
import type {
  TargetMemberSelectionOptions,
} from "./types.js";

export function getDeclaringTypeParameterBindings(
  options: TargetMemberSelectionOptions,
): Map<string, TargetTypeRef> {
  const bindings = new Map<string, TargetTypeRef>();
  const targetType = options.declaringTargetType;
  const typeParameters = options.declaringTypeParameters ?? [];
  if (targetType?.kind !== "target-named" || typeParameters.length === 0) {
    return bindings;
  }
  const typeArguments = targetType.typeArguments ?? [];
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      bindings.set(parameter.name, argument);
    }
  }
  return bindings;
}

export function bindTargetTypeParameter(
  name: string,
  actual: TargetTypeRef,
  typeParameterBindings: Map<string, TargetTypeRef>,
): boolean {
  const existing = typeParameterBindings.get(name);
  if (existing === undefined) {
    typeParameterBindings.set(name, actual);
    return true;
  }
  return targetTypeRefEquals(existing, actual);
}

export function substituteTargetMemberTypeParameters(
  member: CsharpTargetMember,
  typeParameterBindings: ReadonlyMap<string, TargetTypeRef>,
): CsharpTargetMember {
  if (typeParameterBindings.size === 0) {
    return member;
  }
  return {
    ...member,
    ...(member.declaringType !== undefined ? { declaringType: substituteTargetTypeRef(member.declaringType, typeParameterBindings) } : {}),
    parameters: member.parameters.map((parameter) => ({
      ...parameter,
      type: substituteTargetTypeRef(parameter.type, typeParameterBindings),
    })),
    ...(member.returnType !== undefined ? { returnType: substituteTargetTypeRef(member.returnType, typeParameterBindings) } : {}),
  };
}

export { substituteTargetTypeRef };
