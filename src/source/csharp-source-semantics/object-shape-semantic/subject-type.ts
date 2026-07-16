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
  const kind = compiler.ast.kindName(node);
  const declarationName = kind === "KindInterfaceDeclaration" || kind === "KindTypeAliasDeclaration"
    ? asNodeSubject(compiler.ast.name(node))
    : undefined;
  if (declarationName !== undefined) {
    return compiler.checker.getTypeAtLocation(declarationName, { sourceFile });
  }
  const queryNode = node;
  if (queryNode === undefined || isControlFlowLabelIdentifier(compiler.ast, queryNode)) {
    return undefined;
  }
  if (isTypeSyntaxNode(compiler.ast, queryNode)) {
    return compiler.checker.getTypeFromTypeNode(queryNode, { sourceFile });
  }
  return isSemanticTypeQueryableValueExpressionNode(compiler.ast, queryNode)
    ? compiler.checker.getTypeAtLocation(queryNode, { sourceFile })
    : undefined;
}
