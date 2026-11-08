import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpBigIntFitsSourcePrimitive } from "./literal-range.js";

export function selectCsharpNativeIntegerTruncationConversion(
  width: number | undefined, signed: boolean, target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  if (target.kind !== "source-primitive" || target.name === "native-int" || target.name === "native-uint" ||
    width === undefined || !Number.isInteger(width) || width < 0 || width > 128) return undefined;
  const minimum = signed && width !== 0 ? -(1n << BigInt(width - 1)) : 0n;
  const maximum = width === 0 ? 0n : (1n << BigInt(width - (signed ? 1 : 0))) - 1n;
  return csharpBigIntFitsSourcePrimitive(minimum, target.name) && csharpBigIntFitsSourcePrimitive(maximum, target.name)
    ? { kind: "integer-truncation", signed, width } : undefined;
}
