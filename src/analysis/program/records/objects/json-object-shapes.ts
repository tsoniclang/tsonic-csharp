import type { CsharpObjectShapeDemand } from "../../../../target-model/records/objects/object-shape-demand.js";
import { objectShapeArtifactKey } from "../../../../target-model/records/objects/object-shape-keys.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpJsonObjectShapeRecords } from "../../../../target-model/records/objects/json-object-shapes.js";

export function createCsharpJsonObjectShapeRecords(demand: CsharpObjectShapeDemand): CsharpJsonObjectShapeRecords {
  const contracts = new Map(demand.artifacts.map(artifact => [artifact.key, artifact.jsonContract]));
  return Object.freeze({ jsonObjectShape: Object.freeze({ get: (shape: CsharpObjectShapeFact) => contracts.get(objectShapeArtifactKey(shape)) }) });
}
