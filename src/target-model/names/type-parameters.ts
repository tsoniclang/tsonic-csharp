import type { AstReader, Node } from "@tsonic/tsts";
import { sourceNodeIdentity } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../types/model.js";

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
  const identity = sourceNodeIdentity(ast, declaration);
  if (nameNode === undefined || identity === undefined) return undefined;
  const name = ast.text(nameNode);
  return name.length === 0 ? undefined : Object.freeze({ kind: "type-parameter", identity, name });
}

export function csharpGeneratedTypeParameterNames(
  parameters: readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[],
  authoredNames: Iterable<string>,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const used = new Set(authoredNames);
  const reserved = new Set([...used, ...parameters.map(parameter => parameter.name)]);
  for (const parameter of parameters) {
    if (names.has(parameter.identity)) continue;
    let name = parameter.name;
    if (used.has(name)) {
      const preferred = `Captured${name}`;
      name = preferred;
      let suffix = 2;
      while (reserved.has(name)) name = `${preferred}${suffix++}`;
    }
    names.set(parameter.identity, name);
    used.add(name);
    reserved.add(name);
  }
  return names;
}

export function csharpAuthoredTypeParameterNames(node: Node, ast: AstReader): readonly string[] {
  const names = new Set<string>();
  const visit = (current: Node): void => {
    if (ast.is.IsTypeParameterDeclaration(current)) {
      const name = ast.name(current);
      if (name !== undefined) names.add(ast.text(name));
    }
    ast.forEachChild(current, child => { if (child !== undefined) visit(child); });
  };
  visit(node);
  return [...names];
}
