import {
  flowStateFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionLifecycleContext,
  FlowStateFact,
  Node,
} from "@tsonic/tsts";
import {
  getAstReaderChildNodes,
} from "./ast-utils.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";

export function validateCsharpSourceFlowFactsBeforeFinalization(
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
    validateSourceFlowFactsForNode(sourceFile, lifecycleContext);
  }
}

function validateSourceFlowFactsForNode(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  if (compiler.ast.kindName(node) === "KindCallExpression") {
    const flowState = lifecycleContext.host.facts.get(node, flowStateFactKey);
    if (flowState !== undefined) {
      diagnoseUnsupportedCsharpFlowMarker(node, flowState, lifecycleContext);
    }
  }
  for (const child of getAstReaderChildNodes(compiler.ast, node)) {
    if (child !== undefined) {
      validateSourceFlowFactsForNode(child, lifecycleContext);
    }
  }
}

function diagnoseUnsupportedCsharpFlowMarker(
  node: Node,
  flowState: FlowStateFact,
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host">,
): void {
  if (flowState.state !== "borrowed-shared" && flowState.state !== "borrowed-mut" && flowState.state !== "moved") {
    return;
  }
  lifecycleContext.host.diagnostics.append({
    ...csharpProviderDiagnostic(
      lifecycleContext.extensionId,
      "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED",
      9100135,
      `C# target does not implement source flow marker '${sourceFlowMarkerName(flowState.state)}'; this intrinsic requires an explicit target contract and cannot be erased.`,
    ),
    nodeOrSpan: node,
    evidence: [
      {
        message: "C# target source-flow marker contract",
        details: "borrow, borrowMut, and move are portable source contracts. The C# target currently rejects them explicitly instead of treating them as no-op erased calls.",
      },
      {
        message: "Finalized TSTS source-flow fact",
        details: flowState,
      },
    ],
    identity: `csharp-source-flow-marker-unsupported:${flowState.state}:${String(node.id ?? "unknown")}`,
  });
}

function sourceFlowMarkerName(state: FlowStateFact["state"]): string {
  switch (state) {
    case "borrowed-shared":
      return "borrow";
    case "borrowed-mut":
      return "borrowMut";
    case "moved":
      return "move";
    default:
      return state;
  }
}
