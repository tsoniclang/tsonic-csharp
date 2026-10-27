import { getCsharpJsArrayElementTargetType } from "../types/index.js";

import type { TargetTypeRef } from "../../target-model/types/model.js";

export function csharpObjectProjectionValueType(
    projection: "keys" | "values" | "entries" | "has-own",
    resultType: TargetTypeRef,
  ): TargetTypeRef | undefined {
    if (projection === "values") {
      return getCsharpJsArrayElementTargetType(resultType);
    }
    if (projection !== "entries") {
      return undefined;
    }
    const elementType = getCsharpJsArrayElementTargetType(resultType);
    return elementType?.kind === "tuple" && elementType.elements.length === 2
      ? elementType.elements[1]
      : undefined;
  }
