import type {
  ExtensionDiagnostic,
  Node,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function selectedPolicyDiagnostic(
  node: Node,
  diagnostic: ExtensionDiagnostic,
): TargetDiagnostic {
  return {
    code: `TS${diagnostic.numericCode}`,
    category: diagnostic.category,
    source: diagnostic.extensionId,
    message: diagnostic.message,
    sourceNode: node,
    ...(diagnostic.evidence === undefined || diagnostic.evidence.length === 0
      ? {}
      : {
          evidence: uniqueEvidence(
            diagnostic.evidence.map((entry) => entry.message),
          ),
        }),
  };
}

export function targetPolicyDiagnostic(
  node: Node,
  code: string,
  message: string,
  evidence: readonly string[] = [],
): TargetDiagnostic {
  return {
    code,
    category: "error",
    source: "tsonic-csharp",
    message,
    sourceNode: node,
    ...(evidence.length === 0 ? {} : { evidence: uniqueEvidence(evidence) }),
  };
}

export function unsupportedNodeDiagnostic(
  node: Node,
  message: string,
  evidence: readonly string[] = [],
): TargetDiagnostic {
  return {
    code: "CSHARP_UNSUPPORTED_AST",
    category: "error",
    source: "tsonic-csharp",
    message,
    sourceNode: node,
    ...(evidence.length === 0 ? {} : { evidence: uniqueEvidence(evidence) }),
  };
}

function uniqueEvidence(evidence: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(evidence)]);
}
