import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import type {
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../target-model/types/model.js";

export interface CsharpSourceCallableParameterContract {
  readonly sourceParameter: Node;
  readonly targetParameter: CsharpTargetParameter;
}

export interface CsharpSourceCallableContract {
  readonly sourceDeclaration: Node;
  readonly methodTypeParameterNames: readonly string[];
  readonly receiverTypeOwner?: Node;
  readonly parameters: readonly CsharpSourceCallableParameterContract[];
  readonly returnType: TargetTypeRef;
}

export type CsharpSourceCallableArtifactIdentity =
  | {
      readonly kind: "declaration";
      readonly declaration: Node;
    }
  | {
      readonly kind: "project-constructor";
      readonly targetMemberId: string;
    };

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
    return ast.as.AsMethodDeclaration(declaration)?.Body !== undefined;
  }
  if (ast.is.IsConstructorDeclaration(declaration)) {
    return ast.as.AsConstructorDeclaration(declaration)?.Body !== undefined;
  }
  if (!ast.is.IsMethodSignatureDeclaration(declaration)) {
    return false;
  }
  const parent = ast.parent(declaration);
  return parent !== undefined && ast.is.IsInterfaceDeclaration(parent);
}
