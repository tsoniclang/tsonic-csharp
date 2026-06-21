import {
  AsBinaryExpression,
} from "./source-ast.js";
import type { Node } from "@tsonic/tsts";

export function getBinaryLeft(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): Node | undefined {
  return expression.Left ?? (expression as { readonly left?: Node }).left;
}

export function getBinaryRight(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): Node | undefined {
  return expression.Right ?? (expression as { readonly right?: Node }).right;
}

export function getBinaryOperatorToken(expression: NonNullable<ReturnType<typeof AsBinaryExpression>>): unknown {
  return expression.OperatorToken?.Kind ??
    (expression as { readonly operatorToken?: { readonly Kind?: unknown } | unknown }).operatorToken ??
    (expression as { readonly Operator?: unknown; readonly operator?: unknown }).Operator ??
    (expression as { readonly operator?: unknown }).operator;
}
