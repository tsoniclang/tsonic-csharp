import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeCapability, CsharpObjectShapeProjection } from "../types/model.js";
import { targetTypeRefKey } from "../types/equality.js";
import { isSourceDeclaredNominalShape } from "../types/object-shape-projection.js";

export interface CsharpObjectShapeArtifact {
  readonly key: string;
  readonly fact: CsharpObjectShapeFact;
  readonly materialization: "source" | "synthetic";
  readonly capabilities: readonly CsharpObjectShapeCapability[];
  readonly projections: readonly CsharpObjectShapeProjection[];
  readonly receiverBoundMethodKeys: readonly string[];
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

export interface CsharpObjectShapeDemand {
  readonly artifacts: readonly CsharpObjectShapeArtifact[];
  readonly targetShapes: Readonly<Record<string, CsharpObjectShapeFact>>;
  readonly get: (key: string) => CsharpObjectShapeArtifact | undefined;
  readonly projection: (subject: Node) => CsharpObjectShapeProjection | undefined;
}

export function objectShapeArtifactKey(fact: CsharpObjectShapeFact): string {
  return `object-shape:${targetTypeRefKey(fact.targetType)}`;
}

export function objectShapeMaterialization(fact: CsharpObjectShapeFact): "source" | "synthetic" {
  return fact.constructible === true || isSourceDeclaredNominalShape(fact) ? "source" : "synthetic";
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
