import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpProviderTypeParameterRelation,
} from "../../../providers/relations/index.js";
import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
  CsharpTypePolicy,
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpTargetBindingSubstitutions,
  csharpTargetTypePatternFromBinding,
  resolveCsharpTargetTypePatternArguments,
  substituteCsharpTargetMember,
  targetTypeRefEquals,
} from "../../types/index.js";

export interface CsharpSourceTypeEvidence {
  readonly node?: Node;
  readonly type?: Type;
}

export function resolveCsharpTargetBindingArguments(
  types: CsharpTypePolicy,
  binding: CsharpTargetBindingFact,
  sourceEvidence: readonly CsharpSourceTypeEvidence[],
  sourceFile: SourceFile,
): readonly TargetTypeRef[] | undefined {
  const targetArity = binding.typeParameters?.length ?? 0;
  if (targetArity === 0) {
    return [];
  }
  const candidates = sourceEvidence
    .map((evidence) =>
      types.resolveNode(evidence.node, sourceFile) ??
      types.resolveType(evidence.type, sourceFile))
    .filter((type): type is TargetTypeRef => type !== undefined)
    .map((type) => resolveCsharpTargetTypePatternArguments(
      csharpTargetTypePatternFromBinding(binding),
      type,
      binding.typeParameters ?? [],
    ))
    .filter(
      (arguments_): arguments_ is readonly TargetTypeRef[] =>
        arguments_ !== undefined && arguments_.length === targetArity,
    );
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

export function instantiateCsharpProviderBindingMember(
  types: CsharpTypePolicy,
  binding: CsharpTargetBindingFact,
  member: CsharpTargetMember,
  bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[],
  sourceEvidence: readonly CsharpSourceTypeEvidence[],
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
    sourceEvidence,
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
