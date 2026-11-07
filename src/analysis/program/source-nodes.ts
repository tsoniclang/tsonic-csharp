// Authored syntax nodes of the program's source files, in preorder per file (syntax only; no Source meaning).
import type { AstReader, Node, SourceFile } from "@tsonic/tsts";

export function csharpSourceNodes(ast: AstReader, sourceFiles: readonly SourceFile[]): readonly Node[] {
  const nodes: Node[] = [];
  const visit = (node: Node): void => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of sourceFiles) visit(sourceFile as unknown as Node);
  return Object.freeze(nodes);
}
