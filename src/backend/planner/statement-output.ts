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
        kind: "BinaryExpression",
        left: { kind: "IdentifierName", name: "_" },
        operator: "=",
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
      return expression.operator === "++" || expression.operator === "--";
    case "BinaryExpression":
      return isAssignmentOperator(expression.operator);
    default:
      return false;
  }
}

function isAssignmentOperator(operator: string): boolean {
  switch (operator) {
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "/=":
    case "%=":
    case "&=":
    case "|=":
    case "^=":
    case "<<=":
    case ">>=":
    case ">>>=":
      return true;
    default:
      return false;
  }
}
