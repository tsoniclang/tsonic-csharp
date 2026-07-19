import type {
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  getAstReaderChildNodes,
} from "./ast-utils.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  unsupportedCompatRuntimeOperationCode,
  unsupportedCompatRuntimeOperationNumericCode,
} from "./opaque-any-diagnostics/diagnostic-constants.js";
import {
  subjectIdentity,
} from "./opaque-any-diagnostics/subject-identity.js";
import {
  getUnsupportedSourceCompatRuntimeOperation,
} from "./opaque-any-diagnostics/unsupported-compat.js";

export function diagnoseSourceCompatRuntimeHardRejectsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    diagnoseSourceCompatRuntimeHardRejectsForNode(sourceFile, lifecycleContext);
  }
}

function diagnoseSourceCompatRuntimeHardRejectsForNode(
  node: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
): void {
  const compiler = lifecycleContext.compiler;
  if (node === undefined || compiler === undefined) {
    return;
  }
  for (const child of getAstReaderChildNodes(compiler.ast, node)) {
    diagnoseSourceCompatRuntimeHardRejectsForNode(child, lifecycleContext);
  }
  appendUnsupportedCompatRuntimeDiagnostic(
    node,
    getUnsupportedSourceCompatRuntimeOperation(node, lifecycleContext),
    lifecycleContext,
  );
}

function appendUnsupportedCompatRuntimeDiagnostic(
  node: Node,
  unsupportedCompatOperation: ReturnType<typeof getUnsupportedSourceCompatRuntimeOperation>,
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host">,
): void {
  if (unsupportedCompatOperation === undefined) {
    return;
  }
  lifecycleContext.host.diagnostics.append({
    ...csharpProviderDiagnostic(
      lifecycleContext.extensionId,
      unsupportedCompatRuntimeOperationCode,
      unsupportedCompatRuntimeOperationNumericCode,
      unsupportedCompatOperation.message,
    ),
    nodeOrSpan: node,
    evidence: [
      {
        message: "C# compat-runtime boundary rejected",
        details: unsupportedCompatOperation.reason,
      },
      {
        message: "Required architecture",
        details: unsupportedCompatOperation.architecture,
      },
    ],
    identity: `csharp-compat-runtime-operation:${unsupportedCompatOperation.kind}:${subjectIdentity(node)}`,
  });
}
