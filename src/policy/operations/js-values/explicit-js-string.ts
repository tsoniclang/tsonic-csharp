import type { CsharpJsStringConversionSelection } from "../../../target-model/records/operations/explicit-js-string.js";

import type { Node } from "@tsonic/tsts";

import { csharpJsStringTargetType, csharpStringTargetType, targetTypeRefEquals } from "../../types/index.js";

import type { TargetTypeRef } from "../../../target-model/types/model.js";
export function selectCsharpNativeJsStringConversion(
  sourceValue: Node, sourceType: TargetTypeRef | undefined, resultType: TargetTypeRef | undefined,
): CsharpJsStringConversionSelection {
  if (
    sourceType === undefined ||
    !targetTypeRefEquals(sourceType, csharpStringTargetType())
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact JavaScript string conversion source is not the native string carrier selected by C#.",
    };
  }
  if (
    resultType === undefined ||
    !targetTypeRefEquals(resultType, csharpJsStringTargetType())
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact JavaScript string conversion result is not the explicit JavaScript string carrier selected by C#.",
    };
  }
  return Object.freeze({ kind: "resolved", sourceValue, resultType });
}
