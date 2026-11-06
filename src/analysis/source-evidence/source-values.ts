import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";

export function csharpFlowReadPrincipalDeclaration(
  ast: AstReader,
  navigation: Pick<SourceProgramNavigation, "sourceReferenceFor">,
  node: Node,
): Node | undefined {
  const declaration = navigation.sourceReferenceFor(node)?.declaration;
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
  return value.kind === "resolved"
    ? Object.freeze({
        kind: "resolved",
        argument: Object.freeze({
          passingMode: value.argument.passingMode,
          storageExpression: value.argument.storageExpression,
        }),
      })
    : Object.freeze({
        kind: "rejected",
        reason: value.reason,
      });
}
