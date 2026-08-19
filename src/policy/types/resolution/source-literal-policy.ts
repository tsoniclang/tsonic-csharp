import type {
  AstReader,
  Node,
  SourcePrimitiveKind,
} from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import {
  parseFiniteNumberLiteral,
} from "../../../source/literal-values.js";
import type {
  TargetTypeRef,
} from "../model/definitions.js";
import {
  csharpSourcePrimitiveTargetType,
} from "../model/scalar-types.js";
import {
  selectedCsharpSourceProfileOwner,
} from "./source-profile.js";

export interface CsharpSourceLiteralPolicyHost {
  readonly ast: AstReader;
  readonly target: TargetSelection;
}

export function resolveCsharpSourceLiteralTargetType(
  host: CsharpSourceLiteralPolicyHost,
  node: Node,
): TargetTypeRef | undefined {
  const value = csharpNumericLiteralValue(host.ast, node);
  if (value === undefined) {
    return undefined;
  }
  if (
    selectedCsharpSourceProfileOwner(host.target) === "csharp-provider" &&
    Number.isInteger(value) &&
    value >= -2147483648 &&
    value <= 2147483647
  ) {
    return csharpSourcePrimitiveTargetType("int32");
  }
  return csharpSourcePrimitiveTargetType("float64");
}

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
