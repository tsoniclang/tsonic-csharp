import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceIdentityRoles } from "@tsonic/target-api/source";

export function csharpFlowReadPrincipalDeclaration(
  ast: AstReader,
  identity: Pick<SourceIdentityRoles, "target">,
  node: Node,
): Node | undefined {
  const declaration = identity.target(node)?.declaration;
  return declaration !== undefined && (ast.is.IsVariableDeclaration(declaration) ||
    ast.is.IsParameterDeclaration(declaration) || ast.is.IsBindingElement(declaration) ||
    ast.is.IsPropertyDeclaration(declaration) || ast.is.IsPropertySignatureDeclaration(declaration))
    ? declaration : undefined;
}

export function isCsharpFlowReadEvidenceNode(
  ast: import("@tsonic/tsts").AstReader,
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node);
}

export function freezeSourceArgumentClassification(
  value: import("../../target-model/records/program/source-evidence.js").CsharpSourceArgumentClassification,
): import("../../target-model/records/program/source-evidence.js").CsharpSourceArgumentClassification {
  return Object.freeze({
    passingMode: value.passingMode,
    storageExpression: value.storageExpression,
  });
}
