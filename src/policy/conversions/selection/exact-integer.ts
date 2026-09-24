import { getCsharpNullableElementTargetType, isCsharpIntegralTargetType } from "../../types/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpConversionSelection } from "./model.js";

export function selectCsharpExactIntegerConversion(
  source: TargetTypeRef,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const sourceElement = getCsharpNullableElementTargetType(source);
  const targetElement = getCsharpNullableElementTargetType(target);
  const input = sourceElement ?? source;
  const output = targetElement ?? target;
  if (sourceElement !== undefined && targetElement === undefined ||
    input.kind !== "source-primitive" || output.kind !== "source-primitive" ||
    input.name === "char" || output.name === "char" || !isCsharpIntegralTargetType(output)) return undefined;
  if (isCsharpIntegralTargetType(input)) return { kind: "checked-native-integer" };
  return input.name === "float32" || input.name === "float64" || input.name === "decimal"
    ? { kind: "exact-integer", input, output, nullable: sourceElement !== undefined }
    : undefined;
}
