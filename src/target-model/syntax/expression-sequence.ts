import type { AstReader, Node } from "@tsonic/tsts";

export function csharpSourceExpressionSequence(ast: AstReader, node: Node): readonly Node[] {
  if (ast.is.IsParenthesizedExpression(node)) {
    const expression = ast.as.AsParenthesizedExpression(node)?.Expression;
    return expression === undefined ? [node] : csharpSourceExpressionSequence(ast, expression);
  }
  if (ast.is.IsBinaryExpression(node) && ast.operatorKindName(node) === "KindCommaToken") {
    const expression = ast.as.AsBinaryExpression(node);
    if (expression?.Left !== undefined && expression.Right !== undefined) {
      return [...csharpSourceExpressionSequence(ast, expression.Left), ...csharpSourceExpressionSequence(ast, expression.Right)];
    }
  }
  return [node];
}
