import type { CsharpObjectShapeFact, CsharpObjectShapeProjection } from "../../types/model.js";
import { targetTypeRefKey } from "../../types/equality.js";

export function objectShapeArtifactKey(fact: CsharpObjectShapeFact): string {
  return `object-shape:${targetTypeRefKey(fact.targetType)}`;
}

export function objectShapeProjectionKey(projection: CsharpObjectShapeProjection): string {
  return encodeContractParts(objectShapeProjectionContractParts(projection));
}

export function objectShapeProjectionContractParts(projection: CsharpObjectShapeProjection): readonly string[] {
  return [
    projection.kind,
    targetTypeRefKey(projection.resultType),
    ...projection.propertyOrder,
    ...(projection.kind === "assign" ? [
      targetTypeRefKey(projection.sourceShape.targetType),
      ...projection.assignments.flatMap(assignment => [assignment.sourceName, assignment.targetName]),
    ] : []),
  ];
}

export function encodeContractParts(parts: readonly string[]): string {
  return parts.map(part => `${part.length}:${part}`).join("");
}
