import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpCaptureFrame } from "./capture-storage.js";

export function csharpCapturedMemberAccess(
  source: TargetSourceProgram,
  frames: readonly CsharpCaptureFrame[],
): ReadonlySet<Node> {
  const members = new Set<Node>();
  const visited = new Set<Node>();
  const visit = (node: Node): void => {
    if (visited.has(node)) return;
    visited.add(node);
    if (source.ast.is.IsClassDeclaration(node) || source.ast.is.IsClassExpression(node)) return;
    if (source.ast.is.IsPropertyAccessExpression(node) || source.ast.is.IsElementAccessExpression(node)) {
      const operations = source.semantics.forNode(node).operations;
      const declaration = (source.ast.is.IsPropertyAccessExpression(node)
        ? operations.propertyAccess(node) : operations.elementAccess(node))?.selectedDeclaration;
      const name = declaration === undefined ? undefined : source.ast.name(declaration);
      if (declaration !== undefined && (source.ast.hasModifierKind(declaration, "private") ||
          source.ast.hasModifierKind(declaration, "protected") ||
          name !== undefined && source.ast.is.IsPrivateIdentifier(name))) members.add(declaration);
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const frame of frames) for (const method of frame.methods) visit(method.declaration);
  return members;
}
