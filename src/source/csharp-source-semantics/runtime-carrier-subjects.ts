import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import {
  isControlFlowLabelIdentifier,
  isSemanticTypeQueryableValueExpressionNode,
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
  if (isControlFlowLabelIdentifier(compiler.ast, node)) {
    return undefined;
  }
  if (isRuntimeCarrierTypeSyntaxNode(compiler.ast, node)) {
    return compiler.checker.getTypeFromTypeNode(node, { sourceFile });
  }
  return isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)
    ? compiler.checker.getTypeAtLocation(node, { sourceFile })
    : undefined;
}

export function getRuntimeCarrierSubjectSymbol(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): Symbol | undefined {
  if (isRuntimeCarrierTypeSyntaxNode(compiler.ast, node) || isControlFlowLabelIdentifier(compiler.ast, node)) {
    return undefined;
  }
  return getSymbolForDeclarationLookup(compiler.ast, compiler.checker, node, sourceFile);
}

export function isRuntimeCarrierTypeSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return isTypeSyntaxNode(ast, node);
}
