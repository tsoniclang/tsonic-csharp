import type {
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetBindingFact,
  CsharpTargetNamedTypeRef,
} from "./definitions.js";
import {
  substituteTargetTypeParameters,
} from "./substitution.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";

export function csharpTargetTypeFromBinding(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[] = [],
): TargetTypeRef | undefined {
  if (binding.target !== "csharp") {
    return undefined;
  }
  const declaredType = (binding as CsharpTargetBindingFact).csharpType;
  if (declaredType?.kind === "target-named") {
    const renderShape = (declaredType as CsharpTargetNamedTypeRef).csharpRender;
    const withArguments = {
      ...declaredType,
      ...(typeArguments.length > 0 ? { typeArguments } : {}),
      ...(renderShape !== undefined ? { csharpRender: renderShape } : {}),
    };
    return typeArguments.length === 0
      ? withArguments
      : substituteTargetTypeParameters(withArguments, targetBindingTypeArgumentMap(binding, typeArguments));
  }
  if (declaredType !== undefined) {
    return typeArguments.length === 0
      ? declaredType
      : substituteTargetTypeParameters(declaredType, targetBindingTypeArgumentMap(binding, typeArguments));
  }
  const renderShape = (binding as CsharpTargetBindingFact).csharpRender;
  return renderShape === undefined
    ? undefined
    : csharpTargetNamedType(binding.id, typeArguments, renderShape);
}

function targetBindingTypeArgumentMap(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  const substitutions = new Map<string, TargetTypeRef>();
  const typeParameters = binding.typeParameters ?? [];
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      substitutions.set(parameter.name, argument);
    }
  }
  return substitutions;
}

export function csharpBaseTargetTypeFromBinding(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[] = [],
): TargetTypeRef | undefined {
  const baseType = (binding as CsharpTargetBindingFact).csharpBaseType;
  if (baseType === undefined) {
    return undefined;
  }
  return substituteTargetTypeParameters(
    baseType,
    new Map((binding.typeParameters ?? [])
      .map((parameter, index) => {
        const typeArgument = typeArguments[index];
        return typeArgument === undefined ? undefined : [parameter.name, typeArgument] as const;
      })
      .filter((entry): entry is readonly [string, TargetTypeRef] => entry !== undefined)),
  );
}
