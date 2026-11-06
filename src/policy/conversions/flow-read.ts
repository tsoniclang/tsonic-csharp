import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpCarrierAdmitsSourceAbsence, isCsharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { combineCsharpTargetUnionMembers } from "../types/index.js";

export function selectCsharpFlowReadCarrier(input: {
  readonly exactSourceRead: boolean;
  readonly nativeSourceRead: boolean;
  readonly unrelatedSourceTypesShareTargetRepresentation: boolean;
  readonly selectedTargetType: TargetTypeRef | undefined;
  readonly readStorageTargetType: TargetTypeRef | undefined;
  readonly memberTargetTypes: readonly (TargetTypeRef | undefined)[] | undefined;
}): TargetTypeRef | undefined {
  const { selectedTargetType, readStorageTargetType, memberTargetTypes } = input;
  const absenceUsesStorage = isCsharpAbsenceTargetType(selectedTargetType) &&
    csharpCarrierAdmitsSourceAbsence(readStorageTargetType);
  if (absenceUsesStorage) return readStorageTargetType;
  if (input.nativeSourceRead && selectedTargetType !== undefined) return selectedTargetType;
  return (input.exactSourceRead || input.unrelatedSourceTypesShareTargetRepresentation) &&
    readStorageTargetType !== undefined ? readStorageTargetType
    : selectedTargetType !== undefined && readStorageTargetType !== undefined &&
      !targetTypeRefEquals(readStorageTargetType, selectedTargetType) ? selectedTargetType
      : memberTargetTypes === undefined || memberTargetTypes.some(member => member === undefined)
        ? selectedTargetType : combineCsharpTargetUnionMembers(memberTargetTypes as readonly TargetTypeRef[]);
}
