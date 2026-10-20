import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpFrozenDataProperty, CsharpFrozenDataPropertyRecords } from "../../../target-model/records/frozen-data-properties.js";
import { objectShapeArtifactKey } from "./object-shape-keys.js";

export function createCsharpFrozenDataPropertyRecords(entries: ReadonlyMap<string, ReadonlyMap<string, CsharpFrozenDataProperty>>): CsharpFrozenDataPropertyRecords {
  const records = new Map([...entries].map(([key, value]) => [key, new Map(value)]));
  return Object.freeze({ frozenDataProperties: Object.freeze({ get: (shape: CsharpObjectShapeFact) => records.get(objectShapeArtifactKey(shape)) }) });
}
