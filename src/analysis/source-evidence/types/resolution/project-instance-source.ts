import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";

export type CsharpProjectInstanceSource = {
  readonly node: Node;
} & (
  | { readonly kind: "unavailable" }
  | { readonly kind: "class"; readonly member: Node; readonly declaration: Node }
);

export function formCsharpProjectThisSource(
  ast: AstReader,
  node: Node,
): CsharpProjectInstanceSource {
  return ast.kindName(node) !== "KindThisKeyword" && !ast.is.IsThisTypeNode(node)
    ? Object.freeze({ kind: "unavailable", node }) : formCsharpProjectInstanceSource(ast, node);
}

export function formCsharpProjectInstanceSource(
  ast: AstReader,
  node: Node,
): CsharpProjectInstanceSource {
  let current = ast.parent(node);
  while (current !== undefined) {
    if (ast.is.IsArrowFunction(current)) {
      current = ast.parent(current);
      continue;
    }
    if (ast.is.IsFunctionDeclaration(current) || ast.is.IsFunctionExpression(current)) {
      return Object.freeze({ kind: "unavailable", node });
    }
    if (ast.is.IsMethodDeclaration(current) || ast.is.IsGetAccessorDeclaration(current) ||
      ast.is.IsSetAccessorDeclaration(current) || ast.is.IsConstructorDeclaration(current) ||
      ast.is.IsPropertyDeclaration(current)) {
      const ownerNode = ast.parent(current);
      if (ownerNode === undefined || !ast.is.IsClassDeclaration(ownerNode) && !ast.is.IsClassExpression(ownerNode) ||
        ast.hasModifierKind(current, "static")) {
        return Object.freeze({ kind: "unavailable", node });
      }
      return Object.freeze({ kind: "class", node, member: current, declaration: ownerNode });
    }
    if (ast.kindName(current) === "KindClassStaticBlockDeclaration") {
      return Object.freeze({ kind: "unavailable", node });
    }
    current = ast.parent(current);
  }
  return Object.freeze({ kind: "unavailable", node });
}

export function resolveFormedCsharpProjectInstanceTargetType(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  source: CsharpProjectInstanceSource,
): TargetTypeRef | undefined {
  if (source.kind === "unavailable") return undefined;
  const catalog = host.projectTypeCatalog;
  const owner = catalog.definitionForDeclaration(source.declaration);
  return owner === undefined ? undefined : catalog.targetTypeForDeclaration(owner.declaration, owner.typeParameterBindings);
}
