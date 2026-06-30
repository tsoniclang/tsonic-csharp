import {
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  getAliasedSymbolIfAvailable,
} from "./symbol-utils.js";

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
    const symbol = getTypeReferenceSymbol(current, context, sourceFile);
    const aliasedSymbol = getAliasedSymbolIfAvailable(context.compiler.checker, symbol, sourceFile);
    if (
      (symbol !== undefined && context.factResolver.resolve(symbol, sourcePrimitiveFactKey) !== undefined) ||
      (aliasedSymbol !== undefined && context.factResolver.resolve(aliasedSymbol, sourcePrimitiveFactKey) !== undefined)
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

function getTypeReferenceSymbol(
  node: Node,
  context: ExtensionObservationContext,
  sourceFile: SourceFile,
) {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (ast === undefined || checker === undefined) {
    return undefined;
  }
  const lookupNode = ast.is.IsTypeReferenceNode(node)
    ? asNodeSubject(getNodeField(node, "TypeName"))
    : ast.is.IsQualifiedName(node)
      ? node
      : undefined;
  if (lookupNode === undefined) {
    return undefined;
  }
  try {
    return checker.getSymbolAtLocation(lookupNode, { sourceFile });
  } catch {
    return undefined;
  }
}
