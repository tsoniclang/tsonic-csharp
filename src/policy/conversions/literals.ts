import type {
  AstReader,
  Node,
  SourcePrimitiveKind,
} from "@tsonic/tsts";
import {
  parseBigIntLiteral,
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
import {
  csharpNumericLiteralFitsSourcePrimitive,
  csharpNumericLiteralValue,
} from "../types/source-literal-policy.js";

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
      return (
        input.ast.is.IsStringLiteral(node) ||
        input.ast.is.IsNoSubstitutionTemplateLiteral(node)
      ) &&
        input.ast.text(node).length === 1;
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "native-int":
    case "native-uint": {
      return csharpNumericLiteralFitsSourcePrimitive(
        input.ast,
        node,
        target.name,
      );
    }
    case "float16":
    case "float32":
    case "float64":
    case "decimal": {
      const value = csharpNumericLiteralValue(input.ast, node);
      return value !== undefined && Number.isFinite(value);
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128": {
      const value = csharpBigIntLiteralValue(input.ast, node);
      return value !== undefined &&
        csharpBigIntFitsSourcePrimitive(value, target.name);
    }
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
  const operator = ast.operatorKindName(node);
  const operand = ast.as.AsPrefixUnaryExpression(node)?.Operand;
  if (
    (operator !== "KindPlusToken" && operator !== "KindMinusToken") ||
    operand === undefined ||
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
