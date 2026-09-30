import type { TargetTypeRef } from "./model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "./nullable.js";
import { getCsharpGenericOptionalParts, isCsharpAbsenceTargetType } from "./runtime-carriers.js";

export function csharpBindingDefaultCarrier(projected: TargetTypeRef, defaultValue: TargetTypeRef): TargetTypeRef {
  if (isCsharpAbsenceTargetType(projected)) return defaultValue;
  const storage = csharpNullableTargetType(projected);
  if (isCsharpAbsenceTargetType(defaultValue) || getCsharpNullableElementTargetType(defaultValue) !== undefined ||
    getCsharpGenericOptionalParts(defaultValue) !== undefined) return storage;
  return getCsharpNullableElementTargetType(storage) ?? getCsharpGenericOptionalParts(storage)?.element ?? storage;
}
