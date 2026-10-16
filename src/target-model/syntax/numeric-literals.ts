import type { SourcePrimitiveKind } from "@tsonic/tsts";
import type { SourceLiteralValue } from "@tsonic/target-api/source";

export function csharpNumericLiteralFitsSourcePrimitive(
  literal: Pick<SourceLiteralValue, "integer"> | undefined,
  primitive: Exclude<SourcePrimitiveKind, "float16" | "float32" | "float64" | "decimal">,
): boolean {
  return literal?.integer !== undefined && csharpBigIntFitsSourcePrimitive(literal.integer, primitive);
}

export interface CsharpIntegralConstant {
  readonly value: bigint;
  readonly kind: "int32" | "uint32" | "int64";
}

export function csharpUnsuffixedIntegralLiteral(value: number): CsharpIntegralConstant | undefined {
  if (!Number.isInteger(value) || Object.is(value, -0)) return undefined;
  const text = String(value);
  if (!/^-?[0-9]+$/u.test(text)) return undefined;
  const integer = BigInt(text);
  if (integer < -(1n << 63n) || integer > (1n << 63n) - 1n) return undefined;
  const kind = integer >= -2147483648n && integer <= 2147483647n ? "int32"
    : integer >= 0n && integer <= 4294967295n ? "uint32" : "int64";
  return { value: integer, kind };
}

export function csharpIntegralConstantNegation(operand: CsharpIntegralConstant): CsharpIntegralConstant | undefined {
  const kind = operand.kind === "uint32" ? "int64" : operand.kind;
  return csharpBigIntFitsSourcePrimitive(-operand.value, kind) ? { value: -operand.value, kind } : undefined;
}

export function csharpIntegralConstantOperation(
  operator: "+" | "-" | "*" | "/" | "%",
  left: CsharpIntegralConstant,
  right: CsharpIntegralConstant,
): CsharpIntegralConstant | undefined {
  const kind = left.kind === "int64" || right.kind === "int64" ? "int64"
    : left.kind === right.kind ? left.kind
    : (left.kind === "int32" ? left.value : right.value) >= 0n ? "uint32" : "int64";
  if ((operator === "/" || operator === "%") && right.value === 0n) return undefined;
  const value = operator === "+" ? left.value + right.value
    : operator === "-" ? left.value - right.value
    : operator === "*" ? left.value * right.value
    : operator === "/" ? left.value / right.value
    : left.value % right.value;
  return csharpBigIntFitsSourcePrimitive(value, kind) ? { value, kind } : undefined;
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
