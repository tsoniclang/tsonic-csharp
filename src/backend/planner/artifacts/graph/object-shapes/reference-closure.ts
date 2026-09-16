import type { CsharpArtifactGraphScope } from "../engine.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../../target-model/types/index.js";
import { isCsharpValueTypeTargetType, targetTypeRefEquals } from "../../../../../target-model/types/index.js";
import { objectShapeArtifactKey } from "./identity.js";

export function collectCsharpReferenceClosure(
  scope: CsharpArtifactGraphScope,
  type: TargetTypeRef,
  preferred: CsharpObjectShapeFact | undefined,
  pending: ReadonlyMap<string, CsharpObjectShapeFact>,
  capability: "js-freeze" | "reference-identity",
): { readonly kind: "accepted"; readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact> }
  | { readonly kind: "rejected"; readonly reason: string } {
  const root = preferred ?? scope.host.objectShapes.resolveTarget(type);
  if (root === undefined) return { kind: "rejected", reason: `The ${capability} capability requires a closed reference-object shape.` };
  const shapes = new Map([[objectShapeArtifactKey(root), root]]);
  const visible = scope.visibleObjectShapes(pending);
  let changed = true;
  while (changed) {
    changed = false;
    for (const shape of visible) {
      const key = objectShapeArtifactKey(shape);
      if (shapes.has(key) || !(shape.implements ?? []).some(base => [...shapes.values()]
        .some(selected => targetTypeRefEquals(base, selected.targetType)))) continue;
      shapes.set(key, shape);
      changed = true;
    }
  }
  for (const shape of shapes.values()) {
    if (isCsharpValueTypeTargetType(shape.targetType) || capability === "js-freeze" && shape.members.some(member => member.bound === true)) {
      return { kind: "rejected", reason: `The ${capability} capability cannot use native value storage or an unprotected bound write route.` };
    }
  }
  return { kind: "accepted", shapes };
}
