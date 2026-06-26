import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetNamedTypeRef,
} from "../target-types.js";
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
  member: TargetMember,
  typeParameterBindings: ReadonlyMap<string, TargetTypeRef>,
): TargetMember {
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

export function substituteTargetTypeRef(type: TargetTypeRef, typeParameterBindings: ReadonlyMap<string, TargetTypeRef>): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return typeParameterBindings.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments !== undefined
          ? { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeRef(argument, typeParameterBindings)) }
          : {}),
        ...((type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType === undefined
          ? {}
          : { csharpArrayLiteralElementType: substituteTargetTypeRef((type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType!, typeParameterBindings) }),
        ...((type as CsharpTargetNamedTypeRef).csharpEnumerableElementType === undefined
          ? {}
          : { csharpEnumerableElementType: substituteTargetTypeRef((type as CsharpTargetNamedTypeRef).csharpEnumerableElementType!, typeParameterBindings) }),
      };
    case "array":
      return { ...type, element: substituteTargetTypeRef(type.element, typeParameterBindings) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeRef(element, typeParameterBindings)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeRef(type.pointee, typeParameterBindings) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeRef(argument, typeParameterBindings)),
        result: substituteTargetTypeRef(type.result, typeParameterBindings),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeRef(type.owner, typeParameterBindings) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}
