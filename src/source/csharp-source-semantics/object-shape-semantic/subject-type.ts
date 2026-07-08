import type {
  ExtensionObservationContext,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  isControlFlowLabelIdentifier,
  isSemanticTypeQueryableValueExpressionNode,
  isTypeSyntaxNode,
} from "../ast-utils.js";

export function getSemanticTypeForObjectShapeSubject(
  node: ReturnType<typeof asNodeSubject>,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Type | undefined {
  const compiler = context.compiler;
  if (compiler === undefined || node === undefined) {
    return undefined;
  }
  if (isControlFlowLabelIdentifier(compiler.ast, node)) {
    return undefined;
  }
  if (isTypeSyntaxNode(compiler.ast, node)) {
    return compiler.checker.getTypeFromTypeNode(node, { sourceFile });
  }
  return isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)
    ? compiler.checker.getTypeAtLocation(node, { sourceFile })
    : undefined;
}
