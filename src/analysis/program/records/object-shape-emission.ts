import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpObjectShapeEmissionRecords, CsharpObjectShapeParameter } from "../../../target-model/records/object-shape-emission.js";
import { objectShapeArtifactKey } from "../../../target-model/records/object-shape-demand.js";

export function createCsharpObjectShapeEmissionRecords(
  parameters: ReadonlyMap<string, readonly CsharpObjectShapeParameter[]>,
  keys: ReadonlyMap<string, readonly string[]>,
): CsharpObjectShapeEmissionRecords {
  return Object.freeze({
    objectShapeParameters: Object.freeze({ get: (fact: CsharpObjectShapeFact) => parameters.get(objectShapeArtifactKey(fact)) }),
    enumerableKeys: Object.freeze({ get: (fact: CsharpObjectShapeFact) => keys.get(objectShapeArtifactKey(fact)) }),
  });
}
