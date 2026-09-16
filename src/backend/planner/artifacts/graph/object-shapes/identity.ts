import type { CsharpObjectShapeFact } from "../../../../../target-model/types/index.js";
import { targetTypeRefKey } from "../../../../../target-model/types/index.js";

export function objectShapeArtifactKey(fact: CsharpObjectShapeFact): string {
  return `object-shape:${targetTypeRefKey(fact.targetType)}`;
}

export function objectShapeMaterialization(fact: CsharpObjectShapeFact): "source" | "synthetic" {
  return fact.constructible === true || isSourceDeclaredNominalShape(fact)
    ? "source" : "synthetic";
}

export function isSourceDeclaredNominalShape(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as {
      readonly csharpSourceDeclarationKind?: unknown;
    }).csharpSourceDeclarationKind !== undefined;
}
