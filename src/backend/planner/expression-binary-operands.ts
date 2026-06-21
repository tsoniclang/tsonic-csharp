import {
  AsBinaryExpression,
} from "./source-ast.js";
import type { Node } from "@tsonic/tsts";

export function getBinaryLeft(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): Node | undefined {
  return expression.Left;
}

export function getBinaryRight(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): Node | undefined {
  return expression.Right;
}

export function getBinaryOperatorToken(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): unknown {
  return expression.OperatorToken?.Kind;
}
