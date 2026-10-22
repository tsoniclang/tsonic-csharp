import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

export function csharpBindingDefaultCarrier(projected: TargetTypeRef, defaultValue: TargetTypeRef): TargetTypeRef {
  if (isCsharpAbsenceTargetType(projected)) return defaultValue;
  const storage = csharpNullableTargetType(projected);
  if (isCsharpAbsenceTargetType(defaultValue) || getCsharpNullableElementTargetType(defaultValue) !== undefined ||
    getCsharpGenericOptionalParts(defaultValue) !== undefined) return storage;
  return getCsharpNullableElementTargetType(storage) ?? getCsharpGenericOptionalParts(storage)?.element ?? storage;
}
