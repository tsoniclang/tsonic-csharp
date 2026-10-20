import { sourceIntegerTruncationFits } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
export function selectCsharpNativeIntegerTruncationConversion(
  width: number | undefined, signed: boolean, target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  return target.kind === "source-primitive" && width !== undefined && sourceIntegerTruncationFits(width, signed, target.name)
    ? { kind: "integer-truncation", signed, width } : undefined;
}
