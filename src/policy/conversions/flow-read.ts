import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpCarrierAdmitsSourceAbsence, isCsharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";

export function selectCsharpFlowReadCarrier(input: {
  readonly exactSourceRead: boolean;
  readonly nativeSourceRead: boolean;
  readonly unrelatedSourceTypesShareTargetRepresentation: boolean;
  readonly selectedTargetType: TargetTypeRef | undefined;
  readonly readStorageTargetType: TargetTypeRef | undefined;
}): TargetTypeRef | undefined {
  const { selectedTargetType, readStorageTargetType } = input;
  const absenceUsesStorage = isCsharpAbsenceTargetType(selectedTargetType) &&
    csharpCarrierAdmitsSourceAbsence(readStorageTargetType);
  if (absenceUsesStorage) return readStorageTargetType;
  if (input.nativeSourceRead && selectedTargetType !== undefined) return selectedTargetType;
  return (input.exactSourceRead || input.unrelatedSourceTypesShareTargetRepresentation) &&
    readStorageTargetType !== undefined ? readStorageTargetType : selectedTargetType;
}
