import type { SourcePrimitiveKind } from "@tsonic/tsts";
import { compareSourceNumericLiteralMagnitude, type SourceLiteralUnit } from "@tsonic/target-api/source";

export function csharpNumericLiteralInteger(literal: SourceLiteralUnit | undefined): bigint | undefined {
  if (literal?.kind === "bigint") return literal.value;
  if (literal?.kind !== "number") return undefined;
  const value = literal.value;
  if (value.kind === "integer") return value.value;
  if (value.kind === "checked-float64") return Number.isFinite(value.value) && Number.isInteger(value.value) ? BigInt(value.value) : undefined;
  const token = value.token;
  if (token.coefficient === 0n) return 0n;
  if (compareSourceNumericLiteralMagnitude(token, (1n << 128n) - 1n) > 0) return undefined;
  const sign = token.negative ? -1n : 1n;
  if (token.exponent >= 0n) return token.coefficient * 10n ** token.exponent * sign;
  const scale = -token.exponent;
  if (scale >= BigInt(token.coefficient.toString().length)) return undefined;
  const divisor = 10n ** scale;
  return token.coefficient % divisor === 0n ? token.coefficient / divisor * sign : undefined;
}

export function csharpNumericLiteralFitsSourcePrimitive(
  literal: SourceLiteralUnit | undefined,
  primitive: Exclude<SourcePrimitiveKind, "float16" | "float32" | "float64" | "decimal">,
): boolean {
  const integer = csharpNumericLiteralInteger(literal);
  return integer !== undefined && csharpBigIntFitsSourcePrimitive(integer, primitive);
}

export function csharpBigIntFitsSourcePrimitive(
  value: bigint,
  primitive: SourcePrimitiveKind,
): boolean {
  switch (primitive) {
    case "int8":
      return value >= -128n && value <= 127n;
    case "uint8":
      return value >= 0n && value <= 255n;
    case "int16":
      return value >= -32768n && value <= 32767n;
    case "uint16":
      return value >= 0n && value <= 65535n;
    case "int32":
      return value >= -2147483648n && value <= 2147483647n;
    case "uint32":
      return value >= 0n && value <= 4294967295n;
    case "int64":
    case "native-int":
      return value >= -(1n << 63n) && value <= (1n << 63n) - 1n;
    case "uint64":
    case "native-uint":
      return value >= 0n && value <= (1n << 64n) - 1n;
    case "int128":
      return value >= -(1n << 127n) && value <= (1n << 127n) - 1n;
    case "uint128":
      return value >= 0n && value <= (1n << 128n) - 1n;
    default:
      return false;
  }
}
