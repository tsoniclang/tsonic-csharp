import type { CsharpArtifactGraphScope } from "../engine.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../../target-model/types/index.js";
import { isCsharpValueTypeTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../../../../target-model/types/index.js";
import { objectShapeArtifactKey, isSourceDeclaredNominalShape } from "./identity.js";

export function collectCsharpReferenceClosure(
  scope: CsharpArtifactGraphScope,
  type: TargetTypeRef,
  preferred: CsharpObjectShapeFact | undefined,
  pending: ReadonlyMap<string, CsharpObjectShapeFact>,
  capability: "js-freeze" | "reference-identity" | "method-values",
): { readonly kind: "accepted"; readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact> }
  | { readonly kind: "rejected"; readonly reason: string } {
  const root = preferred ?? scope.host.objectShapes.resolveTarget(type);
  if (root === undefined) return { kind: "rejected", reason: `The ${capability} capability requires a closed reference-object shape.` };
  const shapes = new Map<string, CsharpObjectShapeFact>();
  const visible = scope.visibleObjectShapes(pending);
  const dependents = new Map<string, { readonly base: TargetTypeRef; readonly shape: CsharpObjectShapeFact }[]>();
  for (const shape of visible) {
    for (const base of shape.implements ?? []) {
      const key = targetTypeRefKey(base);
      const edges = dependents.get(key) ?? [];
      edges.push({ base, shape });
      dependents.set(key, edges);
    }
  }
  const work = [root];
  for (let index = 0; index < work.length; index++) {
    const shape = work[index]!;
    const key = objectShapeArtifactKey(shape);
    if (shapes.has(key)) continue;
    if (capability === "method-values" && isSourceDeclaredNominalShape(shape)) {
      return { kind: "rejected", reason: "Copying method values requires exact own callable storage, not a nominal prototype method." };
    }
    if (isCsharpValueTypeTargetType(shape.targetType) || capability === "js-freeze" && shape.members.some(member => member.bound === true)) {
      return { kind: "rejected", reason: `The ${capability} capability cannot use native value storage or an unprotected bound write route.` };
    }
    shapes.set(key, shape);
    for (const dependent of dependents.get(targetTypeRefKey(shape.targetType)) ?? []) {
      if (targetTypeRefEquals(dependent.base, shape.targetType)) work.push(dependent.shape);
    }
  }
  return { kind: "accepted", shapes };
}
