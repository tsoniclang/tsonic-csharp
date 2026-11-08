import type { AstReader, Node } from "@tsonic/tsts";
import { csharpSourceNodeIdentity } from "./identities.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";

const typeParameterOwnerKinds = new Set([
  "KindClassDeclaration", "KindClassExpression", "KindInterfaceDeclaration", "KindTypeAliasDeclaration",
  "KindFunctionDeclaration", "KindFunctionExpression", "KindArrowFunction", "KindMethodDeclaration", "KindMethodSignature",
  "KindFunctionType", "KindConstructorType", "KindCallSignature", "KindConstructSignature",
]);

export function csharpSourceTypeParameters(node: Node, ast: AstReader): readonly (Node | undefined)[] {
  return typeParameterOwnerKinds.has(ast.kindName(node)) ? ast.typeParameters(node) : [];
}

export function csharpSourceTypeParameter(declaration: Node, ast: AstReader): Extract<TargetTypeRef, { readonly kind: "type-parameter" }> | undefined {
  if (!ast.is.IsTypeParameterDeclaration(declaration)) return undefined;
  const nameNode = ast.name(declaration);
  const identity = csharpSourceNodeIdentity(ast, declaration);
  if (nameNode === undefined || identity === undefined) return undefined;
  const name = ast.text(nameNode);
  return name.length === 0 ? undefined : Object.freeze({ kind: "type-parameter", identity, name, csharpDeclaration: declaration });
}

