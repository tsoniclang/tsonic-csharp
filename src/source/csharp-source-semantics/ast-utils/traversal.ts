import type {
  AstReader,
  Node,
} from "@tsonic/tsts";

export function visitAstReaderNodes(
  ast: AstReader,
  node: Node,
  visitor: (node: Node) => void,
  seen: WeakSet<object> = new WeakSet(),
  seenKeys: Set<string> = new Set(),
): void {
  const key = astReaderTraversalKey(ast, node);
  if (seen.has(node) || (key !== undefined && seenKeys.has(key))) {
    return;
  }
  seen.add(node);
  if (key !== undefined) {
    seenKeys.add(key);
  }
  visitor(node);
  for (const child of getAstReaderChildNodes(ast, node)) {
    if (child !== undefined) {
      visitAstReaderNodes(ast, child, visitor, seen, seenKeys);
    }
  }
}

function astReaderTraversalKey(ast: AstReader, node: Node): string | undefined {
  const sourceFile = ast.getSourceFile(node);
  const fileName = sourceFile === undefined ? "" : ast.getFileName(sourceFile);
  return `${fileName}:${ast.kindName(node)}:${ast.pos(node)}:${ast.end(node)}`;
}

export function getAstReaderChildNodes(
  ast: AstReader,
  node: Node,
): readonly (Node | undefined)[] {
  return ast.children(node);
}
