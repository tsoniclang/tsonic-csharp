import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getAstReaderChildNodes,
  getNodeField,
} from "./ast-utils.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  getBinaryOperatorText,
} from "./operator-syntax.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "./target-types.js";

const unsupportedAnyOperationCode = "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED";
const unsupportedAnyOperationNumericCode = 9100121;

export function diagnoseOpaqueAnyOperationsBeforeFinalization(
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
    diagnoseOpaqueAnyOperationsForNode(sourceFile, lifecycleContext);
  }
}

function diagnoseOpaqueAnyOperationsForNode(
  node: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
): void {
  const compiler = lifecycleContext.compiler;
  if (node === undefined || compiler === undefined) {
    return;
  }
  for (const child of getAstReaderChildNodes(compiler.ast, node)) {
    diagnoseOpaqueAnyOperationsForNode(child, lifecycleContext);
  }
  const operation = getOpaqueAnyOperation(node, lifecycleContext);
  if (operation === undefined || hasFinalizedTargetOperation(node, lifecycleContext)) {
    return;
  }
  lifecycleContext.host.diagnostics.append({
    ...csharpProviderDiagnostic(
      lifecycleContext.extensionId,
      unsupportedAnyOperationCode,
      unsupportedAnyOperationNumericCode,
      `${operation.description} uses TypeScript any without finalized target operation facts.`,
    ),
    nodeOrSpan: node,
    evidence: [
      {
        message: "C# dynamic boundary rejected",
        details: "TypeScript accepted the operation through any, but the C# target has no finalized dynamic runtime operation for this expression.",
      },
      {
        message: "Required architecture",
        details: "A JS/dynamic compatibility surface must provide an explicit target operation fact; backend emission must not infer dynamic behavior from TypeScript any.",
      },
    ],
    identity: `csharp-any-operation:${operation.kind}:${subjectIdentity(node)}`,
  });
}

function getOpaqueAnyOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): { readonly kind: string; readonly description: string } | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const ast = compiler.ast;
  if (ast.is.IsCallExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext) ||
      hasOpaqueAnyCarrier(node, lifecycleContext)
      ? { kind: "call", description: "C# call emission" }
      : undefined;
  }
  if (ast.is.IsPropertyAccessExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext) ||
      hasOpaqueAnyCarrier(node, lifecycleContext)
      ? { kind: "property", description: "C# property access emission" }
      : undefined;
  }
  if (ast.is.IsElementAccessExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext) ||
      hasOpaqueAnyCarrier(node, lifecycleContext)
      ? { kind: "element", description: "C# element access emission" }
      : undefined;
  }
  if (ast.is.IsBinaryExpression(node)) {
    const operator = getBinaryOperatorText(ast, node);
    if (operator === "=") {
      return undefined;
    }
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Left")), lifecycleContext) ||
      hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Right")), lifecycleContext) ||
      hasOpaqueAnyCarrier(node, lifecycleContext)
      ? { kind: "operator", description: `C# '${operator}' operator emission` }
      : undefined;
  }
  return undefined;
}

function hasFinalizedTargetOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
): boolean {
  return lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey) !== undefined ||
    lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey) !== undefined;
}

function hasOpaqueAnyCarrier(
  subject: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
): boolean {
  return isCsharpAnyRuntimeCarrier(lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey)?.carrier);
}

function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object" && "id" in subject) {
    return String((subject as { readonly id?: unknown }).id ?? "unknown");
  }
  return "unknown";
}
