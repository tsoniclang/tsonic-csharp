import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpNullableElementTargetType, targetTypeRefKey } from "../../target-model/types/index.js";
import { csharpUnionLeaves } from "../../target-model/types/union-relations.js";

export function csharpPropertyProjectionValueTypes(
  type: TargetTypeRef | undefined,
  shapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">,
  definitions?: CsharpTypeDefinitions,
): readonly TargetTypeRef[] {
  if (type === undefined) return [];
  const pending = [type];
  const visited = new Set<string>();
  const values: TargetTypeRef[] = [];
  while (pending.length > 0) {
    const selected = pending.pop()!;
    const key = targetTypeRefKey(selected);
    if (visited.has(key)) continue;
    visited.add(key);
    const present = getCsharpNullableElementTargetType(selected);
    if (present !== undefined) {
      pending.push(present);
      continue;
    }
    const leaves = csharpUnionLeaves(selected, definitions);
    if (leaves !== undefined && leaves.some(leaf => leaf.path.length > 0)) {
      pending.push(...leaves.map(leaf => leaf.carrier));
      continue;
    }
    for (const member of shapes.resolveTarget(selected)?.members ?? []) {
      if (member.sourceKey.kind === "property" && member.memberKind === "property") values.push(member.type);
    }
  }
  return values;
}
