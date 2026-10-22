import type { CsharpProviderTypeParameterRelation } from "../../../target-model/identities/provider-relations.js";
import type { TargetTypeRef } from "../../types/index.js";

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

export function isCompleteTypeParameterRelation(
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
