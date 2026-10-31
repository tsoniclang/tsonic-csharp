import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";

export function unparenthesizeCsharpCallable(expression: CsharpExpression): CsharpExpression {
  while (expression.kind === "ParenthesizedExpression") expression = expression.expression;
  return expression;
}

export function castCsharpCallableOperand(expression: CsharpExpression, type: CsharpTypeNode): CsharpExpression {
  return { kind: "CastExpression", type, expression: unparenthesizeCsharpCallable(expression) };
}
