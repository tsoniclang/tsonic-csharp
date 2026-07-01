import type {
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "./target-types.js";

export function resolveTargetTypeRefFromLiteralTypeSyntax(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): TargetTypeRef | undefined {
  if (!ast.is.IsLiteralTypeNode(node)) {
    return undefined;
  }
  const literal = asNodeSubject(getNodeField(node, "Literal"));
  if (literal === undefined) {
    return undefined;
  }
  switch (ast.kindName(literal)) {
    case "KindStringLiteral":
    case "KindNoSubstitutionTemplateLiteral":
      return csharpStringTargetType();
    case "KindNumericLiteral":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindBigIntLiteral":
      return csharpBigIntegerTargetType();
    case "KindTrueKeyword":
    case "KindFalseKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindPrefixUnaryExpression":
      return resolvePrefixUnaryLiteralType(ast, literal);
    default:
      return undefined;
  }
}

function resolvePrefixUnaryLiteralType(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  literal: Node,
): TargetTypeRef | undefined {
  const operand = asNodeSubject(getNodeField(literal, "Operand")) ??
    asNodeSubject(getNodeField(literal, "operand"));
  if (operand === undefined) {
    return undefined;
  }
  switch (ast.kindName(operand)) {
    case "KindNumericLiteral":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindBigIntLiteral":
      return csharpBigIntegerTargetType();
    default:
      return undefined;
  }
}
