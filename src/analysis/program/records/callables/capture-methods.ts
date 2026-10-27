import type { CsharpCaptureMethodEmission, CsharpCaptureMethodRecords } from "../../../../target-model/records/callables/capture-methods.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import { objectShapeArtifactKey } from "../../../../target-model/records/objects/object-shape-keys.js";

export function createCsharpCaptureMethodRecords(values: ReadonlyMap<string, readonly CsharpCaptureMethodEmission[]>): CsharpCaptureMethodRecords {
  const records = new Map(values);
  return Object.freeze({ captureMethods: Object.freeze({ get: (shape: CsharpObjectShapeFact) => records.get(objectShapeArtifactKey(shape)) }) });
}
