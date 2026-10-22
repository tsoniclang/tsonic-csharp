import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpProviderTypeParameterRelation } from "../../../../target-model/identities/provider-relations.js";
import type { CsharpTargetBindingFact, CsharpTargetMember, TargetTypeRef } from "../../../../policy/types/index.js";
import type { CsharpTypeQueries } from "../../../../policy/model/type-resolution.js";
import { csharpTargetBindingSubstitutions, csharpTargetTypePatternFromBinding, resolveCsharpTargetTypePatternArguments, substituteCsharpTargetMember, targetTypeRefEquals } from "../../../../policy/types/index.js";

import { isCompleteTypeParameterRelation } from "../../../../policy/operations/members/binding-instantiation.js";
export interface CsharpSourceTypeEvidence {
  readonly node?: Node;
  readonly type?: Type;
}

export function resolveCsharpTargetBindingArguments(
  types: CsharpTypeQueries,
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
  types: CsharpTypeQueries,
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
