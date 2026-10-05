import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import type {
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../target-model/types/model.js";

export interface CsharpSourceCallParameterContract {
  readonly sourceParameter?: Node;
  readonly targetParameter: CsharpTargetParameter;
}

export interface CsharpSourceCallContract {
  readonly sourceDeclaration?: Node;
  readonly methodTypeParameterIdentities: readonly string[];
  readonly receiverTypeOwner?: Node;
  readonly parameters: readonly CsharpSourceCallParameterContract[];
  readonly returnType: TargetTypeRef;
  readonly sourceReturnType?: TargetTypeRef;
}

export interface CsharpSourceCallableParameterContract extends CsharpSourceCallParameterContract {
  readonly sourceParameter: Node;
}

export interface CsharpSourceCallableContract extends CsharpSourceCallContract {
  readonly sourceDeclaration: Node;
  readonly parameters: readonly CsharpSourceCallableParameterContract[];
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
    return ast.as.AsMethodDeclaration(declaration)?.Body !== undefined || ast.hasModifierKind(declaration, "abstract");
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
