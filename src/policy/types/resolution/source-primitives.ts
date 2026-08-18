import type { TargetTypescriptCompatibilityMode } from "@tsonic/target-api";
import type { TargetTypeRef } from "../model/definitions.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpNeverTargetType,
  csharpVoidTargetType,
} from "../model/scalar-types.js";
import { csharpAnyTargetType, csharpTsValueTargetType } from "../storage/runtime-carriers.js";

export function resolveKeywordType(
  kind: string,
  typescriptCompatibility: TargetTypescriptCompatibilityMode,
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
      return csharpAnyTargetType(typescriptCompatibility);
    case "KindUnknownKeyword":
      return typescriptCompatibility === "compat"
        ? csharpTsValueTargetType()
        : { kind: "opaque", id: "unknown" };
    case "KindNeverKeyword":
      return csharpNeverTargetType();
    default:
      return undefined;
  }
}
