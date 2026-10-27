import type { SourceCallableContract, CsharpSourceCallParameterContract } from "../../../target-model/records/callables/source-callable-contract.js";
import type { AstReader, Node } from "@tsonic/tsts";

export function csharpSourceCallArgumentParameter(
  callable: SourceCallableContract,
  effectiveArgumentIndex: number,
): CsharpSourceCallParameterContract | undefined {
  const restIndex = callable.nativeParameters.findIndex(parameter => parameter.targetParameter.paramsArray === true);
  return callable.nativeParameters[restIndex < 0 ? effectiveArgumentIndex : Math.min(effectiveArgumentIndex, restIndex)];
}

export function isCsharpSourceCallableArtifactDeclaration(
  ast: AstReader,
  declaration: Node,
): boolean {
  if (ast.is.IsFunctionDeclaration(declaration)) {
    return ast.as.AsFunctionDeclaration(declaration)?.Body !== undefined;
  }
  if (ast.is.IsArrowFunction(declaration)) {
    return ast.as.AsArrowFunction(declaration)?.Body !== undefined;
  }
  if (ast.is.IsFunctionExpression(declaration)) {
    return ast.as.AsFunctionExpression(declaration)?.Body !== undefined;
  }
  if (ast.is.IsMethodDeclaration(declaration)) {
    return ast.as.AsMethodDeclaration(declaration)?.Body !== undefined || ast.hasModifierKind(declaration, "abstract");
  }
  if (ast.is.IsConstructorDeclaration(declaration)) {
    return ast.as.AsConstructorDeclaration(declaration)?.Body !== undefined;
  }
  if (!ast.is.IsMethodSignatureDeclaration(declaration)) {
    return false;
  }
  const parent = ast.parent(declaration);
  return parent !== undefined && (ast.is.IsInterfaceDeclaration(parent) || ast.is.IsTypeLiteralNode(parent));
}
