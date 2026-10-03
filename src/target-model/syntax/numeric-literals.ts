import type {
  AstReader,
  Node,
  SourcePrimitiveKind,
} from "@tsonic/tsts";
import { parseFiniteNumberLiteral } from "./literal-values.js";
import { sourceIntegerLiteralValue } from "@tsonic/target-api/source";

export function csharpNumericLiteralValue(
  ast: AstReader,
  node: Node,
): number | undefined {
  if (ast.is.IsParenthesizedExpression(node)) {
    const inner = ast.as.AsParenthesizedExpression(node)?.Expression;
    return inner === undefined ? undefined : csharpNumericLiteralValue(ast, inner);
  }
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
    (operator !== "KindPlusToken" && operator !== "KindMinusToken")
  ) {
    return undefined;
  }
  const value = csharpNumericLiteralValue(ast, operand);
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
  if (
    primitive === "float16" ||
    primitive === "float32" ||
    primitive === "float64" ||
    primitive === "decimal"
  ) {
    const value = csharpNumericLiteralValue(ast, node);
    return value !== undefined && Number.isFinite(value);
  }
  const integer = csharpBigIntLiteralValue(ast, node);
  return integer !== undefined && csharpBigIntFitsSourcePrimitive(integer, primitive);
}

export const csharpBigIntLiteralValue = sourceIntegerLiteralValue;

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
