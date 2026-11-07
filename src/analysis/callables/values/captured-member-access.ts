import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpCaptureFrame } from "../../../target-model/records/callables/capture-storage.js";

export function csharpCapturedMemberAccess(
  source: TargetSourceProgramFacts,
  frames: readonly CsharpCaptureFrame[],
): ReadonlySet<Node> {
  const members = new Set<Node>();
  const visited = new Set<Node>();
  const visit = (node: Node): void => {
    if (visited.has(node)) return;
    visited.add(node);
    if (source.syntax.is.IsClassDeclaration(node) || source.syntax.is.IsClassExpression(node)) return;
    if (source.syntax.is.IsPropertyAccessExpression(node) || source.syntax.is.IsElementAccessExpression(node)) {
      const selected = source.syntax.is.IsPropertyAccessExpression(node)
        ? source.facts.selections.memberAccess(node)?.selected : source.facts.values.elementAccess(node).selected;
      const declaration = selected?.kind === "member" ? ("declarations" in selected ? selected.declarations[0] : selected.declaration) : undefined;
      const name = declaration === undefined ? undefined : source.syntax.name(declaration);
      if (declaration !== undefined && (source.syntax.hasModifierKind(declaration, "private") ||
          source.syntax.hasModifierKind(declaration, "protected") ||
          name !== undefined && source.syntax.is.IsPrivateIdentifier(name))) members.add(declaration);
    }
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const frame of frames) for (const method of frame.methods) visit(method.declaration);
  return members;
}
