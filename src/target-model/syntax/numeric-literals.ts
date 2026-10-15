import type { SourcePrimitiveKind } from "@tsonic/tsts";
import type { SourceLiteralValue } from "@tsonic/target-api/source";

export function csharpNumericLiteralFitsSourcePrimitive(
  literal: Pick<SourceLiteralValue, "number" | "integer"> | undefined,
  primitive: SourcePrimitiveKind,
): boolean {
  if (
    primitive === "float16" ||
    primitive === "float32" ||
    primitive === "float64" ||
    primitive === "decimal"
  ) {
    return literal?.number !== undefined && Number.isFinite(literal.number);
  }
  return literal?.integer !== undefined && csharpBigIntFitsSourcePrimitive(literal.integer, primitive);
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
