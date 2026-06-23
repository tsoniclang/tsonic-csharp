import type { TargetTypeRef } from "@tsonic/tsts";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  isCsharpThrowableTargetType,
} from "../../source/csharp-source-semantics/target-types.js";

export function expressionStatement(expression: CsharpExpression): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression,
  };
}

export function isCsharpThrowableCarrier(carrier: TargetTypeRef | undefined): boolean {
  return isCsharpThrowableTargetType(carrier);
}

export function isVoidCsharpType(type: CsharpTypeNode): boolean {
  return type.kind === "PredefinedType" && type.name === "void";
}

export function planDiscardedExpression(expression: CsharpExpression): CsharpExpression {
  return isValidCsharpExpressionStatement(expression)
    ? expression
    : {
        kind: "AssignmentExpression",
        left: { kind: "IdentifierName", name: "_" },
        operatorToken: { kind: "EqualsToken" },
        right: expression,
      };
}

function isValidCsharpExpressionStatement(expression: CsharpExpression): boolean {
  switch (expression.kind) {
    case "InvocationExpression":
    case "ObjectCreationExpression":
    case "PostfixUnaryExpression":
      return true;
    case "PrefixUnaryExpression":
      return expression.operatorToken.kind === "PlusPlusToken" || expression.operatorToken.kind === "MinusMinusToken";
    case "AssignmentExpression":
      return true;
    default:
      return false;
  }
}
