import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceNodeNavigationFacts } from "@tsonic/target-api/source";

export function csharpFlowReadPrincipalDeclaration(
  ast: AstReader,
  navigation: Pick<SourceNodeNavigationFacts, "sourceReferenceFor">,
  node: Node,
): Node | undefined {
  const declaration = navigation.sourceReferenceFor(node)?.declaration;
  return declaration !== undefined && (ast.is.IsVariableDeclaration(declaration) ||
    ast.is.IsParameterDeclaration(declaration) || ast.is.IsBindingElement(declaration) ||
    ast.is.IsPropertyDeclaration(declaration) || ast.is.IsPropertySignatureDeclaration(declaration))
    ? declaration : undefined;
}
