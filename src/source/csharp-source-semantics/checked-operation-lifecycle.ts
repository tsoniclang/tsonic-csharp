import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  targetOperationFactKey,
} from "@tsonic/tsts";
import {
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";

export function recordCsharpCheckedOperationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
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
      recordCheckedOperationFact(lifecycleContext.host, compiler, sourceFile, node);
    });
  }
}

function recordCheckedOperationFact(
  host: ExtensionObservationContext["host"],
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile,
  node: Node,
): void {
  if (
    host.facts.get(node, targetOperationFactKey) !== undefined ||
    host.facts.get(node, csharpTargetOperationFactKey) !== undefined
  ) {
    return;
  }
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
