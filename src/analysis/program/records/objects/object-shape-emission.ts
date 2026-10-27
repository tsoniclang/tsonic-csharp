import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpObjectShapeDeclarationEmission, CsharpObjectShapeEmission, CsharpObjectShapeEmissionRecords, CsharpObjectShapeParameter } from "../../../../target-model/records/objects/object-shape-emission.js";
import { objectShapeArtifactKey } from "../../../../target-model/records/objects/object-shape-keys.js";
import type { CsharpObjectShapeDisplayName } from "../../../../target-model/records/objects/object-shape-names.js";

export function createCsharpObjectShapeEmissionRecords(
  parameters: ReadonlyMap<string, readonly CsharpObjectShapeParameter[]>,
  keys: ReadonlyMap<string, readonly string[]>,
  emissions: ReadonlyMap<string, CsharpObjectShapeEmission>,
  declarations: readonly CsharpObjectShapeDeclarationEmission[],
  names: readonly CsharpObjectShapeDisplayName[],
): CsharpObjectShapeEmissionRecords {
  const inventory = Object.freeze(declarations);
  return Object.freeze({
    objectShapeNames: Object.freeze({ get: () => names }),
    objectShapeEmission: Object.freeze({ get: (fact: CsharpObjectShapeFact) => emissions.get(objectShapeArtifactKey(fact)) }),
    objectShapeDeclarations: Object.freeze({ get: () => inventory }),
    objectShapeParameters: Object.freeze({ get: (fact: CsharpObjectShapeFact) => parameters.get(objectShapeArtifactKey(fact)) }),
    enumerableKeys: Object.freeze({ get: (fact: CsharpObjectShapeFact) => keys.get(objectShapeArtifactKey(fact)) }),
  });
}
