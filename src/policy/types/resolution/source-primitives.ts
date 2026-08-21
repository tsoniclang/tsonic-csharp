import type { TargetTypeRef } from "../../../target-model/types/model.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpNeverTargetType,
  csharpVoidTargetType,
} from "../../../target-model/types/scalar-types.js";
import { csharpAnyTargetType, csharpTsValueTargetType } from "../../../target-model/types/runtime-carriers.js";

export function resolveKeywordType(
  kind: string,
): TargetTypeRef | undefined {
  switch (kind) {
    case "KindBooleanKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindNumberKeyword":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindStringKeyword":
      return csharpStringTargetType();
    case "KindBigIntKeyword":
      return csharpBigIntegerTargetType();
    case "KindVoidKeyword":
      return csharpVoidTargetType();
    case "KindAnyKeyword":
      return csharpAnyTargetType();
    case "KindUnknownKeyword":
      return csharpTsValueTargetType();
    case "KindNeverKeyword":
      return csharpNeverTargetType();
    default:
      return undefined;
  }
}
