import type { Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";

export function sourceRefinementOnlyRemovesNullish(
  declaredType: Type,
  selectedType: Type,
  queries: SourceFileSemantics,
): boolean {
  const refinement = queries.types.refinement(declaredType, selectedType);
  if (refinement.kind !== "members" || refinement.types.length === 0 ||
    refinement.types.some(type => queries.types.isNullish(type))) return false;
  const declaredMembers = queries.types.unionOrIntersectionTypes(declaredType);
  if (declaredMembers.some(type => type === undefined)) return false;
  const present = declaredMembers.filter((type): type is Type => type !== undefined && !queries.types.isNullish(type));
  return present.length < declaredMembers.length && present.length === refinement.types.length &&
    present.every(type => refinement.types.includes(type));
}

