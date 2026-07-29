import type {
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpProviderTypeParameterRelation,
} from "../../provider/target-relations/index.js";
import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
  CsharpTypePolicy,
  TargetTypeRef,
} from "../types/index.js";
import {
  substituteTargetTypeParameters,
  targetTypeRefEquals,
} from "../types/index.js";

export function resolveCsharpTargetBindingArguments(
  types: CsharpTypePolicy,
  binding: CsharpTargetBindingFact,
  sourceTypes: readonly (Type | undefined)[],
  sourceFile: SourceFile,
): readonly TargetTypeRef[] | undefined {
  const targetArity = binding.typeParameters?.length ?? 0;
  if (targetArity === 0) {
    return [];
  }
  const candidates = sourceTypes
    .map((type) => types.resolveType(type, sourceFile))
    .filter(
      (type): type is TargetTypeRef =>
        type !== undefined &&
        type.kind === "target-named" &&
        type.id === binding.id,
    )
    .map((type) => type.kind === "target-named" ? type.typeArguments ?? [] : [])
    .filter((arguments_) => arguments_.length === targetArity);
  if (candidates.length === 0) {
    return undefined;
  }
  const first = candidates[0]!;
  return candidates.every((arguments_) =>
      arguments_.every((argument, index) =>
        targetTypeRefEquals(argument, first[index]!)))
    ? first
    : undefined;
}

export function csharpTargetBindingSubstitutions(
  binding: CsharpTargetBindingFact,
  arguments_: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const parameters = binding.typeParameters ?? [];
  if (parameters.length !== arguments_.length) {
    return undefined;
  }
  return new Map(
    parameters.map((parameter, index) => [
      parameter.name,
      arguments_[index]!,
    ]),
  );
}

export function instantiateCsharpProviderBindingMember(
  types: CsharpTypePolicy,
  binding: CsharpTargetBindingFact,
  member: CsharpTargetMember,
  bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[],
  sourceTypes: readonly (Type | undefined)[],
  sourceFile: SourceFile,
): CsharpTargetMember | undefined {
  if (!isCompleteTypeParameterRelation(
    bindingTypeParameters,
    binding.typeParameters?.length ?? 0,
  )) {
    return undefined;
  }
  const arguments_ = resolveCsharpTargetBindingArguments(
    types,
    binding,
    sourceTypes,
    sourceFile,
  );
  if (arguments_ === undefined) {
    return undefined;
  }
  const substitutions = csharpTargetBindingSubstitutions(binding, arguments_);
  return substitutions === undefined
    ? undefined
    : substituteCsharpTargetMember(member, substitutions);
}

export function mergeCsharpTypeParameterSubstitutions(
  first: ReadonlyMap<string, TargetTypeRef>,
  second: ReadonlyMap<string, TargetTypeRef>,
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const merged = new Map(first);
  for (const [name, type] of second) {
    if (merged.has(name)) {
      return undefined;
    }
    merged.set(name, type);
  }
  return merged;
}

export function substituteCsharpTargetMember(
  member: CsharpTargetMember,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): CsharpTargetMember {
  return {
    ...member,
    parameters: member.parameters.map((parameter) => ({
      ...parameter,
      type: substituteTargetTypeParameters(parameter.type, substitutions),
    })),
    ...(member.returnType === undefined
      ? {}
      : {
          returnType: substituteTargetTypeParameters(
            member.returnType,
            substitutions,
          ),
        }),
    ...(member.declaringType === undefined
      ? {}
      : {
          declaringType: substituteTargetTypeParameters(
            member.declaringType,
            substitutions,
          ),
        }),
    ...(member.csharpInvocation === undefined
      ? {}
      : member.csharpInvocation.kind === "static-factory-construction"
        ? {
            csharpInvocation: {
              ...member.csharpInvocation,
              factoryType: substituteTargetTypeParameters(
                member.csharpInvocation.factoryType,
                substitutions,
              ),
            },
          }
        : { csharpInvocation: member.csharpInvocation }),
  };
}

function isCompleteTypeParameterRelation(
  relations: readonly CsharpProviderTypeParameterRelation[],
  targetArity: number,
): boolean {
  if (relations.length !== targetArity) {
    return false;
  }
  const sourceIndexes = new Set<number>();
  const targetIndexes = new Set<number>();
  for (const relation of relations) {
    if (
      relation.sourceTypeParameterIndex < 0 ||
      relation.targetTypeParameterIndex < 0 ||
      relation.sourceTypeParameterIndex >= relations.length ||
      relation.targetTypeParameterIndex >= targetArity ||
      sourceIndexes.has(relation.sourceTypeParameterIndex) ||
      targetIndexes.has(relation.targetTypeParameterIndex)
    ) {
      return false;
    }
    sourceIndexes.add(relation.sourceTypeParameterIndex);
    targetIndexes.add(relation.targetTypeParameterIndex);
  }
  return true;
}
