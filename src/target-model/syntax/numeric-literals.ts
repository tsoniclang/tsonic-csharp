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
  if (primitive === "native-int" || primitive === "native-uint") {
    const integer = csharpBigIntLiteralValue(ast, node);
    return integer !== undefined && csharpBigIntFitsSourcePrimitive(integer, primitive);
  }
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
      return value >= -2147483648 && value <= 2147483647;
    case "uint32":
      return value >= 0 && value <= 4294967295;
    default:
      return false;
  }
}

export const csharpBigIntLiteralValue = sourceIntegerLiteralValue;

export function csharpBigIntFitsSourcePrimitive(
  value: bigint,
  primitive: SourcePrimitiveKind,
): boolean {
  switch (primitive) {
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
