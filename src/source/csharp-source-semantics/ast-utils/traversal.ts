import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import {
  getStructuralChildNodes,
} from "./node-access.js";

export function visitStructuralNodes(
  node: Node,
  visitor: (node: Node) => void,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  visitor(node);
  for (const child of getStructuralChildNodes(node)) {
    if (child !== undefined) {
      visitStructuralNodes(child, visitor, seen);
    }
  }
}

export function visitAstReaderNodes(
  ast: AstReader,
  node: Node,
  visitor: (node: Node) => void,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  visitor(node);
  for (const child of getAstReaderChildNodes(ast, node)) {
    if (child !== undefined) {
      visitAstReaderNodes(ast, child, visitor, seen);
    }
  }
}

export function getAstReaderChildNodes(
  ast: AstReader,
  node: Node,
): readonly (Node | undefined)[] {
  return [
    ...readAstNodeList(() => ast.children(node)),
    ...readAstNodeList(() => ast.typeArguments(node)),
    ...readAstNodeList(() => ast.typeParameters(node)),
    ...readAstNodeList(() => ast.parameters(node)),
    ...readAstNodeList(() => ast.members(node)),
    ...readAstNodeList(() => ast.elements(node)),
    ...readAstNodeList(() => ast.properties(node)),
    ...readAstNodeList(() => ast.arguments(node)),
    ...getStructuralChildNodes(node),
  ];
}

function readAstNodeList(read: () => readonly (Node | undefined)[]): readonly (Node | undefined)[] {
  try {
    return read();
  } catch {
    return [];
  }
}
