import type { CsharpStructuralObjectEmission, CsharpStructuralObjectEmissionRecords } from "../../../../target-model/records/objects/structural-object-emission.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import { objectShapeArtifactKey } from "../../../../target-model/records/objects/object-shape-keys.js";

export function createCsharpStructuralObjectEmissionRecords(
  values: ReadonlyMap<string, CsharpStructuralObjectEmission>,
): CsharpStructuralObjectEmissionRecords {
  return Object.freeze({ structuralObject: Object.freeze({ get: (shape: CsharpObjectShapeFact) => values.get(objectShapeArtifactKey(shape)) }) });
}
