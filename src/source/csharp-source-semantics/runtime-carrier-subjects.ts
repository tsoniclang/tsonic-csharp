import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import {
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  getSymbolForDeclarationLookup,
} from "./symbol-utils.js";

export function getRuntimeCarrierSubjectType(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): Type | undefined {
  return isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)
    ? compiler.checker.getTypeFromTypeNode(node, { sourceFile }) ?? compiler.checker.getTypeAtLocation(node, { sourceFile })
    : compiler.checker.getTypeAtLocation(node, { sourceFile });
}

export function getRuntimeCarrierSubjectSymbol(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): Symbol | undefined {
  return getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile);
}

export function isRuntimeCarrierTypeSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return isTypeSyntaxNode(ast, node);
}
