import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpObjectCaptureField, CsharpAuthoredObjectMethod, CsharpObjectMethodRecords } from "../../../target-model/records/object-methods.js";
import { objectShapeArtifactKey } from "./object-shape-keys.js";

export function createCsharpObjectMethodRecords(
  captures: ReadonlyMap<string, readonly CsharpObjectCaptureField[]>,
  methods: ReadonlyMap<string, readonly CsharpAuthoredObjectMethod[]>,
): CsharpObjectMethodRecords {
  return Object.freeze({
    objectCaptures: Object.freeze({ get: (shape: CsharpObjectShapeFact) => captures.get(objectShapeArtifactKey(shape)) }),
    objectMethods: Object.freeze({ get: (shape: CsharpObjectShapeFact) => methods.get(objectShapeArtifactKey(shape)) }),
  });
}
