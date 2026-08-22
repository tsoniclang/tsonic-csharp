import type { AstReader, Node } from "@tsonic/tsts";

export function directCsharpSourceYieldExpression(
  ast: AstReader,
  node: Node | undefined,
): Node | undefined {
  let current = node;
  while (current !== undefined) {
    if (ast.is.IsYieldExpression(current)) {
      return current;
    }
    if (
      !ast.is.IsParenthesizedExpression(current) &&
      !ast.is.IsAsExpression(current) &&
      !ast.is.IsTypeAssertion(current) &&
      !ast.is.IsSatisfiesExpression(current) &&
      !ast.is.IsNonNullExpression(current)
    ) {
      return undefined;
    }
    const typeNode = ast.typeNode(current);
    current = ast.children(current).find((child) =>
      child !== undefined &&
      child !== typeNode &&
      !ast.kindName(child).endsWith("Token")
    );
  }
  return undefined;
}
