import { isCsharpValueTypeTargetType } from "../../target-model/types/identity.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export function csharpReadonlyFieldPreservesStorage(type: TargetTypeRef): boolean {
  const selected = getCsharpNullableElementTargetType(type) ?? type;
  return selected.kind !== "type-parameter" && (selected.kind === "source-primitive" || !isCsharpValueTypeTargetType(selected));
}
