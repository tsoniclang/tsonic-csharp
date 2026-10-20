import { isCsharpValueTypeTargetType, type TargetTypeRef } from "../../types/index.js";

export function classifyCsharpStorageReceiver(
  type: TargetTypeRef | undefined,
): "reference" | "value" | "unknown" {
  if (type === undefined) {
    return "unknown";
  }
  if (isCsharpValueTypeTargetType(type)) {
    return "value";
  }
  switch (type.kind) {
    case "array":
    case "target-named":
      return "reference";
    case "source-primitive":
    case "tuple":
    case "pointer":
    case "function-pointer":
      return "value";
    case "type-parameter":
    case "opaque":
      return "unknown";
  }
}
