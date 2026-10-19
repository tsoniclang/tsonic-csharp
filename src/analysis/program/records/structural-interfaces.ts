import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefKey } from "../../../target-model/types/identity.js";
import type { CsharpStructuralInterfaceEmission, CsharpStructuralInterfaceRecords } from "../../../target-model/records/structural-interfaces.js";

export function createCsharpStructuralInterfaceRecords(rows: readonly {
  readonly carrier: TargetTypeRef;
  readonly implementations: readonly CsharpStructuralInterfaceEmission[];
}[]): CsharpStructuralInterfaceRecords {
  const values = new Map(rows.map(row => [targetTypeRefKey(row.carrier), row.implementations]));
  return Object.freeze({ structuralInterface: Object.freeze({ get: (carrier: TargetTypeRef) => values.get(targetTypeRefKey(carrier)) }) });
}
