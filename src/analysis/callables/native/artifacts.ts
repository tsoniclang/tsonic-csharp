import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";

export function csharpNativeCallableArtifact(
  ast: AstReader, navigation: Pick<SourceProgramFacts["navigation"], "callableRoles">, declaration: Node,
): boolean {
  const roles = navigation.callableRoles(declaration);
  if (!roles.signature) return false;
  if (roles.body) return true;
  if (ast.is.IsMethodDeclaration(declaration) || ast.is.IsGetAccessorDeclaration(declaration) || ast.is.IsSetAccessorDeclaration(declaration)) {
    return ast.hasModifierKind(declaration, "abstract");
  }
  if (!ast.is.IsMethodSignatureDeclaration(declaration)) return false;
  const parent = ast.parent(declaration);
  return parent !== undefined && (ast.is.IsInterfaceDeclaration(parent) || ast.is.IsTypeLiteralNode(parent));
}
