import type { CsharpObjectShapeFact } from "../../../../../target-model/types/index.js";
import { targetTypeRefKey } from "../../../../../target-model/types/index.js";
import { isSourceDeclaredNominalShape } from "../../../../../target-model/types/object-shape-projection.js";

export function objectShapeArtifactKey(fact: CsharpObjectShapeFact): string {
  return `object-shape:${targetTypeRefKey(fact.targetType)}`;
}

export function objectShapeMaterialization(fact: CsharpObjectShapeFact): "source" | "synthetic" {
  return fact.constructible === true || isSourceDeclaredNominalShape(fact)
    ? "source" : "synthetic";
}
