import type {
  AstReader,
  Node,
  SourcePrimitiveKind,
} from "@tsonic/tsts";
import {
  parseBigIntLiteral,
  parseFiniteNumberLiteral,
} from "./literal-values.js";

export function csharpNumericLiteralValue(
  ast: AstReader,
  node: Node,
): number | undefined {
  if (ast.is.IsNumericLiteral(node)) {
    return parseFiniteNumberLiteral(ast.text(node));
  }
  if (!ast.is.IsPrefixUnaryExpression(node)) {
    return undefined;
  }
  const expression = ast.as.AsPrefixUnaryExpression(node);
  const operand = expression?.Operand;
  const operator = ast.operatorKindName(node);
  if (
    operand === undefined ||
    !ast.is.IsNumericLiteral(operand) ||
    (operator !== "KindPlusToken" && operator !== "KindMinusToken")
  ) {
    return undefined;
  }
  const value = parseFiniteNumberLiteral(ast.text(operand));
  return value === undefined
    ? undefined
    : operator === "KindMinusToken"
      ? -value
      : value;
}

export function csharpNumericLiteralFitsSourcePrimitive(
  ast: AstReader,
  node: Node,
  primitive: SourcePrimitiveKind,
): boolean {
  const value = csharpNumericLiteralValue(ast, node);
  if (value === undefined) {
    return false;
  }
  if (
    primitive === "float16" ||
    primitive === "float32" ||
    primitive === "float64" ||
    primitive === "decimal"
  ) {
    return Number.isFinite(value);
  }
  if (!Number.isInteger(value)) {
    return false;
  }
  switch (primitive) {
    case "int8":
      return value >= -128 && value <= 127;
    case "uint8":
      return value >= 0 && value <= 255;
    case "int16":
      return value >= -32768 && value <= 32767;
    case "uint16":
      return value >= 0 && value <= 65535;
    case "int32":
    case "native-int":
      return value >= -2147483648 && value <= 2147483647;
    case "uint32":
    case "native-uint":
      return value >= 0 && value <= 4294967295;
    default:
      return false;
  }
}

export function csharpBigIntLiteralValue(
  ast: AstReader,
  node: Node,
): bigint | undefined {
  if (ast.is.IsBigIntLiteral(node) || ast.is.IsNumericLiteral(node)) {
    return parseBigIntLiteral(ast.text(node));
  }
  if (!ast.is.IsPrefixUnaryExpression(node)) {
    return undefined;
  }
  const expression = ast.as.AsPrefixUnaryExpression(node);
  const operand = expression?.Operand;
  const operator = ast.operatorKindName(node);
  if (
    operand === undefined ||
    (operator !== "KindPlusToken" && operator !== "KindMinusToken") ||
    (!ast.is.IsBigIntLiteral(operand) && !ast.is.IsNumericLiteral(operand))
  ) {
    return undefined;
  }
  const value = parseBigIntLiteral(ast.text(operand));
  return value === undefined
    ? undefined
    : operator === "KindMinusToken"
      ? -value
      : value;
}

export function csharpBigIntFitsSourcePrimitive(
  value: bigint,
  primitive: SourcePrimitiveKind,
): boolean {
  switch (primitive) {
    case "int64":
      return value >= -(1n << 63n) && value <= (1n << 63n) - 1n;
    case "uint64":
      return value >= 0n && value <= (1n << 64n) - 1n;
    case "int128":
      return value >= -(1n << 127n) && value <= (1n << 127n) - 1n;
    case "uint128":
      return value >= 0n && value <= (1n << 128n) - 1n;
    default:
      return false;
  }
}
