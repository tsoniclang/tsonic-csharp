import type {
  Node,
  SourcePrimitiveKind,
} from "@tsonic/tsts";
import {
  parseBigIntLiteral,
  parseFiniteNumberLiteral,
} from "../../source/source-literal-values.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  TargetTypeRef,
} from "../types/index.js";
import {
  getCsharpArrayLiteralElementTargetType,
  getCsharpNullableElementTargetType,
  isCsharpStringTargetType,
} from "../types/index.js";

export function csharpLiteralIsRepresentableAs(
  input: Pick<CsharpTranslationContext, "ast">,
  node: Node,
  target: TargetTypeRef,
): boolean {
  const nullableElement = getCsharpNullableElementTargetType(target);
  if (nullableElement !== undefined) {
    return csharpLiteralIsRepresentableAs(input, node, nullableElement);
  }
  if (input.ast.is.IsArrayLiteralExpression(node)) {
    const elementType = target.kind === "array"
      ? target.element
      : getCsharpArrayLiteralElementTargetType(target);
    return elementType !== undefined &&
      input.ast.elements(node).every((element) =>
        element !== undefined &&
        csharpLiteralIsRepresentableAs(input, element, elementType));
  }
  if (isCsharpStringTargetType(target)) {
    return input.ast.is.IsStringLiteral(node) ||
      input.ast.is.IsNoSubstitutionTemplateLiteral(node);
  }
  if (target.kind !== "source-primitive") {
    return false;
  }
  switch (target.name) {
    case "bool":
      return input.ast.kindName(node) === "KindTrueKeyword" ||
        input.ast.kindName(node) === "KindFalseKeyword";
    case "char":
      return input.ast.is.IsStringLiteral(node) &&
        [...input.ast.text(node)].length === 1;
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "native-int":
    case "native-uint": {
      const value = numericLiteralValue(input, node);
      return value !== undefined &&
        numberFitsSourcePrimitive(value, target.name);
    }
    case "float16":
    case "float32":
    case "float64":
    case "decimal": {
      const value = numericLiteralValue(input, node);
      return value !== undefined && Number.isFinite(value);
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128": {
      const value = bigintLiteralValue(input, node);
      return value !== undefined &&
        bigintFitsSourcePrimitive(value, target.name);
    }
  }
}

function numericLiteralValue(
  input: Pick<CsharpTranslationContext, "ast">,
  node: Node,
): number | undefined {
  if (input.ast.is.IsNumericLiteral(node)) {
    return parseFiniteNumberLiteral(input.ast.text(node));
  }
  if (!input.ast.is.IsPrefixUnaryExpression(node)) {
    return undefined;
  }
  const operator = input.ast.operatorKindName(node);
  const operand = input.ast.as.AsPrefixUnaryExpression(node)?.Operand;
  if (
    (operator !== "KindPlusToken" && operator !== "KindMinusToken") ||
    operand === undefined ||
    !input.ast.is.IsNumericLiteral(operand)
  ) {
    return undefined;
  }
  const value = parseFiniteNumberLiteral(input.ast.text(operand));
  return value === undefined
    ? undefined
    : operator === "KindMinusToken"
      ? -value
      : value;
}

function bigintLiteralValue(
  input: Pick<CsharpTranslationContext, "ast">,
  node: Node,
): bigint | undefined {
  if (input.ast.is.IsBigIntLiteral(node)) {
    return parseBigIntLiteral(input.ast.text(node));
  }
  if (!input.ast.is.IsPrefixUnaryExpression(node)) {
    return undefined;
  }
  const operator = input.ast.operatorKindName(node);
  const operand = input.ast.as.AsPrefixUnaryExpression(node)?.Operand;
  if (
    (operator !== "KindPlusToken" && operator !== "KindMinusToken") ||
    operand === undefined ||
    !input.ast.is.IsBigIntLiteral(operand)
  ) {
    return undefined;
  }
  const value = parseBigIntLiteral(input.ast.text(operand));
  return value === undefined
    ? undefined
    : operator === "KindMinusToken"
      ? -value
      : value;
}

function numberFitsSourcePrimitive(
  value: number,
  primitive: SourcePrimitiveKind,
): boolean {
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

function bigintFitsSourcePrimitive(
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
