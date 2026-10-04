import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { TryStatement_FinallyBlock, sourceControlTransferTarget, sourceEnclosingCallable,
  type TargetSourceProgram } from "@tsonic/target-api/source";

export function analyzeCsharpNativeControlFlow(source: TargetSourceProgram): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const ast = source.ast;
  const within = (node: Node, root: Node): boolean => {
    let current: Node | undefined = node;
    for (let remaining = 2_048; current !== undefined && remaining > 0; remaining -= 1) {
      if (current === root) return true;
      current = ast.parent(current);
    }
    return false;
  };
  const visit = (node: Node, cleanup: Node | undefined): void => {
    if (cleanup !== undefined && sourceEnclosingCallable(node, ast) !== sourceEnclosingCallable(cleanup, ast))
      cleanup = undefined;
    const kind = ast.kindName(node);
    if (cleanup !== undefined && (kind === "KindReturnStatement" || kind === "KindBreakStatement" ||
      kind === "KindContinueStatement")) {
      const target = kind === "KindReturnStatement" ? undefined : sourceControlTransferTarget(ast, node);
      if (target === undefined || !within(target, cleanup)) issues.push(Object.freeze({
        code: "CSHARP_NATIVE_FINALLY_CONTROL_TRANSFER", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "Native C# forbids return, break or continue leaving a finally body. Keep the control transfer outside cleanup.",
      }));
    }
    const finalBlock = ast.is.IsTryStatement(node) ? TryStatement_FinallyBlock(ast, node) : undefined;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child, child === finalBlock ? child : cleanup); });
  };
  source.navigation.sourceFiles.forEach(file => visit(file, undefined));
  return Object.freeze(issues);
}
