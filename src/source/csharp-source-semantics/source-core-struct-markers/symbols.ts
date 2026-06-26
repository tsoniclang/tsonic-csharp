import type {
  ExtensionObservationContext,
  Node,
  Symbol,
} from "@tsonic/tsts";

export function getSafeSymbol(
  node: Node,
  context: ExtensionObservationContext,
): Symbol | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  try {
    return compiler.checker.getSymbolAtLocation(node, { sourceFile: compiler.ast.getSourceFile(node) });
  } catch {
    return undefined;
  }
}

export function getSafeResolvedSymbol(
  node: Node,
  context: ExtensionObservationContext,
): Symbol | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  try {
    return compiler.checker.getResolvedSymbol(node, { sourceFile: compiler.ast.getSourceFile(node) });
  } catch {
    return undefined;
  }
}
