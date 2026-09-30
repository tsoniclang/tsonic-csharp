import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../target-model/types/nullable.js";
import { getCsharpGenericOptionalParts, isCsharpAbsenceTargetType } from "../../target-model/types/runtime-carriers.js";

export function csharpBindingDefaultCarrier(projected: TargetTypeRef, fallback: TargetTypeRef): TargetTypeRef {
  if (isCsharpAbsenceTargetType(projected)) return fallback;
  const storage = csharpNullableTargetType(projected);
  if (isCsharpAbsenceTargetType(fallback) || getCsharpNullableElementTargetType(fallback) !== undefined ||
    getCsharpGenericOptionalParts(fallback) !== undefined) return storage;
  return getCsharpNullableElementTargetType(storage) ?? getCsharpGenericOptionalParts(storage)?.element ?? storage;
}
