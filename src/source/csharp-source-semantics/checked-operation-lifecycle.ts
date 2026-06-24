import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  visitAstReaderNodes,
} from "./ast-utils.js";

export function recordCsharpCheckedOperationFactsBeforeFinalization(
  lifecycleContext: { readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordCheckedOperationFact(compiler, sourceFile, node);
    });
  }
}

function recordCheckedOperationFact(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): void {
  if (compiler.ast.is.IsCallExpression(node) || compiler.ast.is.IsNewExpression(node)) {
    compiler.checker.getResolvedSignature(node, { sourceFile });
    return;
  }
  if (
    compiler.ast.is.IsPropertyAccessExpression(node) ||
    compiler.ast.is.IsElementAccessExpression(node) ||
    compiler.ast.is.IsBinaryExpression(node)
  ) {
    compiler.checker.getTypeAtLocation(node, { sourceFile });
  }
}
