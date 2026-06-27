import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  getAstReaderChildNodes,
} from "../ast-utils.js";

export function collectRuntimeCarrierNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  seen: WeakSet<object> = new WeakSet(),
): readonly Node[] {
  if (seen.has(node)) {
    return [];
  }
  seen.add(node);
  const nodes: Node[] = [node];
  for (const child of getAstReaderChildNodes(ast, node)) {
    if (child !== undefined) {
      nodes.push(...collectRuntimeCarrierNodes(ast, child, seen));
    }
  }
  return nodes;
}
