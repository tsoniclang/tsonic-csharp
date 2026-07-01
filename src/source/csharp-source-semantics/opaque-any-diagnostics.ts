import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
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
  hasClosedCompatRuntimeOperation,
} from "./opaque-any-diagnostics/closed-compat.js";
import {
  unsupportedAnyOperationCode,
  unsupportedAnyOperationNumericCode,
  unsupportedCompatRuntimeOperationCode,
  unsupportedCompatRuntimeOperationNumericCode,
} from "./opaque-any-diagnostics/diagnostic-constants.js";
import {
  getOpaqueAnyOperation,
} from "./opaque-any-diagnostics/opaque-operation.js";
import {
  compatAnyBinaryOperatorOperation,
  compatAnyUnaryOperatorOperation,
} from "./compat-runtime-operation-model.js";
import {
  getBinaryOperatorText,
  getPrefixUnaryOperatorText,
} from "./operator-syntax.js";
import {
  subjectIdentity,
} from "./opaque-any-diagnostics/subject-identity.js";
import {
  getUnsupportedCompatRuntimeOperation,
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

export function diagnoseOpaqueAnyOperationsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
  compatibilityMode: TargetTypescriptCompatibilityMode,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    diagnoseOpaqueAnyOperationsForNode(sourceFile, lifecycleContext, compatibilityMode);
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

function diagnoseOpaqueAnyOperationsForNode(
  node: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
  compatibilityMode: TargetTypescriptCompatibilityMode,
): void {
  const compiler = lifecycleContext.compiler;
  if (node === undefined || compiler === undefined) {
    return;
  }
  for (const child of getAstReaderChildNodes(compiler.ast, node)) {
    diagnoseOpaqueAnyOperationsForNode(child, lifecycleContext, compatibilityMode);
  }
  const unsupportedCompatOperation = getUnsupportedCompatRuntimeOperation(node, lifecycleContext);
  appendUnsupportedCompatRuntimeDiagnostic(node, unsupportedCompatOperation, lifecycleContext);
  const operation = getOpaqueAnyOperation(node, lifecycleContext);
  if (operation === undefined) {
    return;
  }
  if (compatibilityMode === "compat" && isUnsupportedCompatAnyOperator(node, lifecycleContext)) {
    return;
  }
  if (compatibilityMode === "compat" && hasExistingCompatOperationDiagnostic(node, lifecycleContext)) {
    return;
  }
  if (compatibilityMode === "compat" && hasClosedCompatRuntimeOperation(node, lifecycleContext)) {
    return;
  }
  const modeDetails = compatibilityMode === "strict-native"
    ? {
        message: `${operation.description} uses TypeScript any in strict-native mode.`,
        reason: "Strict-native mode hard-rejects dynamic TypeScript any operations even if a compatibility surface has produced target operation facts.",
        architecture: "Select typescriptCompatibility: \"compat\" and provide closed TsValue/TsObject/TsFunction operation facts to enable dynamic behavior.",
      }
    : {
        message: `${operation.description} uses TypeScript any in compatibility mode without finalized target operation facts.`,
        reason: "Compatibility mode is selected, but no closed dynamic runtime operation fact exists for this expression.",
        architecture: "A selected compatibility surface must provide an explicit TsValue/TsObject/TsFunction operation fact; backend emission must not infer dynamic behavior from TypeScript any.",
      };
  lifecycleContext.host.diagnostics.append({
    ...csharpProviderDiagnostic(
      lifecycleContext.extensionId,
      unsupportedAnyOperationCode,
      unsupportedAnyOperationNumericCode,
      modeDetails.message,
    ),
    nodeOrSpan: node,
    evidence: [
      {
        message: "C# dynamic boundary rejected",
        details: modeDetails.reason,
      },
      {
        message: "Required architecture",
        details: modeDetails.architecture,
      },
    ],
    identity: `csharp-any-operation:${compatibilityMode}:${operation.kind}:${subjectIdentity(node)}`,
  });
}

function isUnsupportedCompatAnyOperator(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "compiler">,
): boolean {
  const ast = lifecycleContext.compiler?.ast;
  if (ast === undefined) {
    return false;
  }
  if (ast.is.IsBinaryExpression(node)) {
    const operator = getBinaryOperatorText(ast, node);
    return operator !== undefined && operator !== "=" && compatAnyBinaryOperatorOperation(operator) === undefined;
  }
  if (ast.is.IsPrefixUnaryExpression(node)) {
    const operator = getPrefixUnaryOperatorText(ast, node);
    return operator !== undefined && compatAnyUnaryOperatorOperation(operator) === undefined;
  }
  if (ast.is.IsDeleteExpression(node)) {
    return true;
  }
  return false;
}

function hasExistingCompatOperationDiagnostic(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
): boolean {
  return lifecycleContext.host.diagnostics.all().some((diagnostic) =>
    diagnostic.nodeOrSpan === node &&
    (
      diagnostic.extensionCode === "CSHARP_COMPAT_ANY_OPERATOR_UNSUPPORTED" ||
      diagnostic.extensionCode === unsupportedCompatRuntimeOperationCode ||
      diagnostic.extensionCode === "CSHARP_OPERATOR_NOT_MAPPED"
    )
  );
}

function appendUnsupportedCompatRuntimeDiagnostic(
  node: Node,
  unsupportedCompatOperation: ReturnType<typeof getUnsupportedCompatRuntimeOperation>,
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
