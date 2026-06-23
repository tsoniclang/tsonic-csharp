import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourcePrimitiveKind,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  parseBigIntLiteral,
  parseFiniteNumberLiteral,
} from "../source-literal-values.js";
import {
  isCsharpStringType,
} from "./target-rules.js";
import {
  getCsharpArrayLiteralElementTargetType,
} from "./target-types.js";

export function isLiteralRepresentableAsTargetType(
  expected: TargetTypeRef,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return false;
  }
  const kind = ast.kindName(node);
  if (kind === "KindArrayLiteralExpression") {
    const elementType = getTargetElementTypeForArrayLiteral(expected);
    return elementType === undefined
      ? false
      : ast.elements(node).every((element) =>
          element !== undefined && isLiteralRepresentableAsTargetType(elementType, element, context));
  }
  if (isCsharpStringType(expected)) {
    return kind === "KindStringLiteral" || kind === "KindNoSubstitutionTemplateLiteral";
  }
  if (expected.kind !== "source-primitive") {
    return false;
  }
  switch (expected.name) {
    case "bool":
      return ast.kindName(node) === "KindTrueKeyword" || ast.kindName(node) === "KindFalseKeyword";
    case "char": {
      if (!ast.is.IsStringLiteral(node)) {
        return false;
      }
      return [...ast.text(node)].length === 1;
    }
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "native-int":
    case "native-uint": {
      const value = getNumericLiteralValue(node, context);
      return value !== undefined && isNumberRepresentableAsPrimitive(value, expected.name);
    }
    case "float16":
    case "float32":
    case "float64":
    case "decimal": {
      const value = getNumericLiteralValue(node, context);
      return value !== undefined && Number.isFinite(value);
    }
    case "int64":
    case "uint64":
    case "int128":
    case "uint128": {
      const value = getBigIntLiteralValue(node, context);
      return value !== undefined && isBigIntRepresentableAsPrimitive(value, expected.name);
    }
  }
}

function getTargetElementTypeForArrayLiteral(expected: TargetTypeRef): TargetTypeRef | undefined {
  if (expected.kind === "array") {
    return expected.element;
  }
  return getCsharpArrayLiteralElementTargetType(expected);
}

function getNumericLiteralValue(
  node: Node,
  context: ExtensionObservationContext,
): number | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const kind = ast.kindName(node);
  if (kind === "KindNumericLiteral") {
    return parseFiniteNumberLiteral(ast.text(node));
  }
  if (kind !== "KindPrefixUnaryExpression") {
    return undefined;
  }
  const operator = getPrefixUnaryOperatorKindName(node, ast);
  if (operator !== "KindPlusToken" && operator !== "KindMinusToken") {
    return undefined;
  }
  const operand = asNodeSubject(getNodeField(node, "Operand"));
  if (operand === undefined || ast.kindName(operand) !== "KindNumericLiteral") {
    return undefined;
  }
  const value = parseFiniteNumberLiteral(ast.text(operand));
  return value === undefined ? undefined : operator === "KindMinusToken" ? -value : value;
}

function getBigIntLiteralValue(
  node: Node,
  context: ExtensionObservationContext,
): bigint | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const kind = ast.kindName(node);
  if (kind === "KindBigIntLiteral") {
    return parseBigIntLiteral(ast.text(node));
  }
  if (kind !== "KindPrefixUnaryExpression") {
    return undefined;
  }
  const operator = getPrefixUnaryOperatorKindName(node, ast);
  if (operator !== "KindPlusToken" && operator !== "KindMinusToken") {
    return undefined;
  }
  const operand = asNodeSubject(getNodeField(node, "Operand"));
  if (operand === undefined || ast.kindName(operand) !== "KindBigIntLiteral") {
    return undefined;
  }
  const value = parseBigIntLiteral(ast.text(operand));
  return value === undefined ? undefined : operator === "KindMinusToken" ? -value : value;
}

function getPrefixUnaryOperatorKindName(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string | undefined {
  const operator = getNodeField(node, "Operator");
  if (typeof operator === "number") {
    return ast.kindNameFromKind(operator);
  }
  if (typeof operator === "string") {
    return operator;
  }
  const token = asNodeSubject(getNodeField(node, "OperatorToken"));
  return token === undefined ? undefined : ast.kindName(token);
}

function isNumberRepresentableAsPrimitive(value: number, primitive: SourcePrimitiveKind): boolean {
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
    case "native-int":
      return value >= -2147483648 && value <= 2147483647;
    case "native-uint":
      return value >= 0 && value <= 4294967295;
    default:
      return false;
  }
}

function isBigIntRepresentableAsPrimitive(value: bigint, primitive: SourcePrimitiveKind): boolean {
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
