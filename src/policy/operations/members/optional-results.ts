import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";

export function optionalResultType(
  type: TargetTypeRef | undefined,
  optional: boolean,
): TargetTypeRef | undefined {
  return type === undefined || !optional
    ? type
    : csharpNullableTargetType(type);
}
