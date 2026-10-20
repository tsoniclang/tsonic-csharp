import type { CsharpNamePlan } from "../../../target-model/names/model.js";
import type { CsharpSourceNameRecords } from "../../../target-model/records/names.js";

export function createCsharpSourceNameRecords(names: CsharpNamePlan): CsharpSourceNameRecords {
  const inventory = Object.freeze({ reservedNames: names.reservedNames, typeParameterNames: names.typeParameterNames });
  return Object.freeze({ sourceName: Object.freeze({ get: names.resolve }),
    nameInventory: Object.freeze({ get: () => inventory }), generatedMethodTypeParameters: names.generatedMethodTypeParameters });
}
