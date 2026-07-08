import type {
  ExtensionObservationContext,
  Node,
  Symbol,
} from "@tsonic/tsts";

export function getSourceCoreSymbolAtLocation(
  node: Node,
  context: ExtensionObservationContext,
): Symbol | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  return compiler.checker.getSymbolAtLocation(node, { sourceFile: compiler.ast.getSourceFile(node) });
}

export function getSourceCoreResolvedSymbol(
  node: Node,
  context: ExtensionObservationContext,
): Symbol | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  return compiler.checker.getResolvedSymbolOrNil(node, { sourceFile: compiler.ast.getSourceFile(node) }) ?? undefined;
}
