import type { CsharpProviderTypeParameterRelation } from "../../../../target-model/identities/provider-relations.js";
import type { TargetTypeRef } from "../../../../target-model/types/native-type-data.js";
import type { CsharpTargetBindingFact, CsharpTargetMember } from "../../../../target-model/types/model.js";
import { csharpTargetBindingSubstitutions, csharpTargetTypePatternFromBinding, resolveCsharpTargetTypePatternArguments, substituteCsharpTargetMember, targetTypeRefEquals } from "../../../../policy/types/index.js";
import { isCompleteTypeParameterRelation } from "../../../../policy/operations/members/binding-instantiation.js";

export function resolveCsharpTargetBindingArguments(
  binding: CsharpTargetBindingFact,
  carriers: readonly TargetTypeRef[],
): readonly TargetTypeRef[] | undefined {
  const arity = binding.typeParameters?.length ?? 0;
  if (arity === 0) return Object.freeze([]);
  const argumentsByCarrier = carriers.map(carrier => resolveCsharpTargetTypePatternArguments(
    csharpTargetTypePatternFromBinding(binding), carrier, binding.typeParameters ?? []));
  if (argumentsByCarrier.length === 0 || argumentsByCarrier.some(arguments_ => arguments_ === undefined || arguments_.length !== arity)) return undefined;
  const first = argumentsByCarrier[0]!;
  if (first === undefined) return undefined;
  return argumentsByCarrier.every(arguments_ => arguments_?.every((argument, index) =>
    targetTypeRefEquals(argument, first[index]!))) ? Object.freeze([...first]) : undefined;
}

export function instantiateCsharpProviderBindingMember(
  binding: CsharpTargetBindingFact,
  member: CsharpTargetMember,
  parameters: readonly CsharpProviderTypeParameterRelation[],
  carriers: readonly TargetTypeRef[],
): CsharpTargetMember | undefined {
  if (!isCompleteTypeParameterRelation(parameters, binding.typeParameters?.length ?? 0)) return undefined;
  const arguments_ = resolveCsharpTargetBindingArguments(binding, carriers);
  if (arguments_ === undefined) return undefined;
  const substitutions = csharpTargetBindingSubstitutions(binding, arguments_);
  return substitutions === undefined ? undefined : substituteCsharpTargetMember(member, substitutions);
}
