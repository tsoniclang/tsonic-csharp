import type { CsharpSourceUnionEmission, CsharpSourceUnionEmissionRecords } from "../../../target-model/records/source-unions.js";

export function createCsharpSourceUnionEmissionRecords(values: readonly CsharpSourceUnionEmission[]): CsharpSourceUnionEmissionRecords {
  const selected = Object.freeze(values);
  return Object.freeze({ sourceUnions: Object.freeze({ get: () => selected }) });
}
