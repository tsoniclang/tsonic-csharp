import type { AstReader, Node } from "@tsonic/tsts";
export interface CsharpDestructuringAssignmentSyntax {
  readonly expression: Node;
  readonly pattern: Node;
  readonly source: Node;
}

export function isCsharpDestructuringAssignmentPattern(
  ast: AstReader,
  node: Node | undefined,
): node is Node {
  return node !== undefined &&
    (
      ast.is.IsArrayLiteralExpression(node) ||
      ast.is.IsObjectLiteralExpression(node)
    );
}

export function csharpDestructuringAssignmentSyntax(
  ast: AstReader,
  node: Node | undefined,
): CsharpDestructuringAssignmentSyntax | undefined {
  if (
    node === undefined ||
    !ast.is.IsBinaryExpression(node) ||
    ast.operatorKindName(node) !== "KindEqualsToken"
  ) {
    return undefined;
  }
  const expression = ast.as.AsBinaryExpression(node);
  const pattern = expression?.Left;
  const source = expression?.Right;
  return pattern !== undefined &&
      source !== undefined &&
      isCsharpDestructuringAssignmentPattern(ast, pattern)
    ? { expression: node, pattern, source }
    : undefined;
}
