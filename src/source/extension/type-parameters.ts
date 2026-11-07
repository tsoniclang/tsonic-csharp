import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceScopeRoles } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";

/** The authored type parameters of a node whose Host role is `type-parameter-owner` (E13); none for any other node. */
export function csharpSourceTypeParameters(node: Node, ast: AstReader, scopes: Pick<SourceScopeRoles, "role">): readonly (Node | undefined)[] {
  return scopes.role(node).includes("type-parameter-owner") ? ast.typeParameters(node) : [];
}

export function csharpSourceTypeParameter(declaration: Node, ast: AstReader): Extract<TargetTypeRef, { readonly kind: "type-parameter" }> | undefined {
  if (!ast.is.IsTypeParameterDeclaration(declaration)) return undefined;
  const nameNode = ast.name(declaration);
  const identity = csharpTypeParameterIdentity(ast, declaration);
  if (nameNode === undefined || identity === undefined) return undefined;
  const name = ast.text(nameNode);
  return name.length === 0 ? undefined : Object.freeze({ kind: "type-parameter", identity, name, csharpDeclaration: declaration });
}


/**
 * The C# identity key of a generic binder: its authored position (file path, syntax kind, start, end). This is a target
 * naming key read from authored syntax only; it selects no Source meaning (R2).
 */
function csharpTypeParameterIdentity(ast: AstReader, declaration: Node): string | undefined {
  const sourceFile = ast.getSourceFile(declaration);
  const kind = ast.kind(declaration);
  return sourceFile === undefined || kind === undefined
    ? undefined : `${ast.getPath(sourceFile)}\u0000${kind}\u0000${ast.pos(declaration)}\u0000${ast.end(declaration)}`;
}
