import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceIdentityRoles, SourceScopeRoles } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/model.js";

/** The authored type parameters of a node whose Host role is `type-parameter-owner` (E13); none for any other node. */
export function csharpSourceTypeParameters(node: Node, ast: AstReader, scopes: Pick<SourceScopeRoles, "role">): readonly (Node | undefined)[] {
  return scopes.role(node).includes("type-parameter-owner") ? ast.typeParameters(node) : [];
}

/**
 * The C# type-parameter reference of an authored generic binder. Its identity key is the Host naming identity
 * (`facts.navigation.identity`); it selects no Source meaning (R2).
 */
export function csharpSourceTypeParameter(
  declaration: Node,
  ast: AstReader,
  identity: Pick<SourceIdentityRoles, "identity">,
): Extract<TargetTypeRef, { readonly kind: "type-parameter" }> | undefined {
  if (!ast.is.IsTypeParameterDeclaration(declaration)) return undefined;
  const nameNode = ast.name(declaration);
  if (nameNode === undefined) return undefined;
  const name = ast.text(nameNode);
  return name.length === 0
    ? undefined
    : Object.freeze({ kind: "type-parameter", identity: identity.identity(declaration), name, csharpDeclaration: declaration });
}
