import type {
  Node,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetPlannerInvariant } from "@tsonic/target-api/artifacts";

export function failCsharpPlannerInvariant(message: string, sourceNode?: Node): never {
  return failTargetPlannerInvariant("tsonic-csharp", message, sourceNode);
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
