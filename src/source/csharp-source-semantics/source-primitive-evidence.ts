import {
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";

export function typeSyntaxContainsSourcePrimitiveEvidence(
  node: Node,
  context: ExtensionObservationContext,
  sourceFile: SourceFile | undefined,
): boolean {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (ast === undefined || checker === undefined || sourceFile === undefined) {
    return false;
  }
  let found = false;
  const visit = (current: Node | undefined): void => {
    if (current === undefined || found) {
      return;
    }
    if (context.factResolver.resolve(current, sourcePrimitiveFactKey) !== undefined) {
      found = true;
      return;
    }
    const symbol = safeGetSymbolAtLocation(current, context, sourceFile);
    const resolvedSymbol = safeGetResolvedSymbol(current, context, sourceFile);
    if (
      (symbol !== undefined && context.factResolver.resolve(symbol, sourcePrimitiveFactKey) !== undefined) ||
      (resolvedSymbol !== undefined && context.factResolver.resolve(resolvedSymbol, sourcePrimitiveFactKey) !== undefined)
    ) {
      found = true;
      return;
    }
    ast.forEachChild(current, (child): void => {
      visit(child);
    });
  };
  visit(node);
  return found;
}

function safeGetSymbolAtLocation(
  node: Node,
  context: ExtensionObservationContext,
  sourceFile: SourceFile,
) {
  try {
    return context.compiler?.checker.getSymbolAtLocation(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function safeGetResolvedSymbol(
  node: Node,
  context: ExtensionObservationContext,
  sourceFile: SourceFile,
) {
  try {
    return context.compiler?.checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}
