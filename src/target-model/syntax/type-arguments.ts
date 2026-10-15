import type { AstReader, Node } from "@tsonic/tsts";

export function csharpSourceTypeArgumentNodes(
  ast: AstReader,
  node: Node | undefined,
): readonly Node[] {
  if (
    node === undefined ||
    (
      !ast.is.IsTypeReferenceNode(node) &&
      !ast.is.IsExpressionWithTypeArguments(node) &&
      !ast.is.IsCallExpression(node) &&
      !ast.is.IsNewExpression(node)
    )
  ) {
    return [];
  }
  return ast.typeArguments(node).filter(
    (argument): argument is Node => argument !== undefined,
  );
}
