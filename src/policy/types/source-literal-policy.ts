import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import type {
  TargetSelection,
} from "@tsonic/target-api";
import {
  parseFiniteNumberLiteral,
} from "../../source/source-literal-values.js";
import type {
  TargetTypeRef,
} from "./definitions.js";
import {
  csharpSourcePrimitiveTargetType,
} from "./scalar-types.js";
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
  const value = numericLiteralValue(host.ast, node);
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

function numericLiteralValue(
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
