import type { Node } from "@tsonic/tsts";

export function getUnaryOperatorKind(expression: { readonly Operator?: unknown; readonly OperatorToken?: Node | undefined }): unknown {
  return expression.Operator ?? expression.OperatorToken?.Kind;
}
