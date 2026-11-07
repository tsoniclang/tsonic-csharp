// Literal range checks. A fixed-width kind is a .NET representability check against its fixed bounds. A native kind
// (native-int / native-uint) has no fixed width: its fit is the Host's (facts.analyses.platform.nativeIntegerFit, the
// one N5/E24 rule over the published premise, Q89/Q90). A "refused" fit (width missing or conflicting where the 32-bit
// and 64-bit answers differ) is not representable here; the Host raises that refusal at the Source site.
import type { SourcePrimitiveKind } from "@tsonic/tsts";
import type { SourceLiteralValue, SourcePublishedPlatformFacts } from "@tsonic/target-api/source";

export function csharpNumericLiteralFitsSourcePrimitive(
  literal: Pick<SourceLiteralValue, "integer" | "number" | "numeric"> | undefined,
  primitive: Exclude<SourcePrimitiveKind, "float16" | "float32" | "float64" | "decimal">,
  platform: SourcePublishedPlatformFacts,
): boolean {
  return literal?.integer !== undefined && csharpBigIntFitsSourcePrimitive(literal.integer, primitive, platform);
}

export function csharpBigIntFitsSourcePrimitive(
  value: bigint,
  primitive: SourcePrimitiveKind,
  platform: SourcePublishedPlatformFacts,
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
      return value >= -(1n << 63n) && value <= (1n << 63n) - 1n;
    case "uint64":
      return value >= 0n && value <= (1n << 64n) - 1n;
    case "native-int":
    case "native-uint":
      return platform.nativeIntegerFit(value, primitive) === "fits";
    case "int128":
      return value >= -(1n << 127n) && value <= (1n << 127n) - 1n;
    case "uint128":
      return value >= 0n && value <= (1n << 128n) - 1n;
    default:
      return false;
  }
}
