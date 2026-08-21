import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  TargetTypeRef,
} from "../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export type CsharpRuntimeCarrierResolution =
  | {
      readonly kind: "resolved";
      readonly carrier: TargetTypeRef;
      readonly evidence: readonly CsharpRuntimeCarrierEvidence[];
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
      readonly evidence: readonly CsharpRuntimeCarrierEvidence[];
    };

export interface CsharpRuntimeCarrierEvidence {
  readonly message: string;
}

export function getRuntimeCarrierForExpression(
  input: CsharpPlanningContext,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return getTargetTypeRefForNode(input, sourceNode, sourceFile);
}

export function resolveRuntimeCarrierForExpression(
  input: CsharpPlanningContext,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): CsharpRuntimeCarrierResolution | undefined {
  return resolveRuntimeCarrier(input, sourceNode, sourceFile, "value");
}

export function resolveRuntimeCarrierForStorage(
  input: CsharpPlanningContext,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): CsharpRuntimeCarrierResolution | undefined {
  return resolveRuntimeCarrier(input, sourceNode, sourceFile, "storage");
}

function resolveRuntimeCarrier(
  input: CsharpPlanningContext,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  mode: "value" | "storage",
): CsharpRuntimeCarrierResolution | undefined {
  if (sourceNode === undefined) {
    return undefined;
  }
  const carrier = mode === "storage"
    ? input.types.policy.resolveStorage(sourceNode, sourceFile)
    : input.types.policy.resolveNode(sourceNode, sourceFile);
  return carrier === undefined
    ? {
        kind: "missing",
        reason:
          "C# runtime representation is not proven by authored source facts, the selected source profile, project declarations, or an exact provider relation.",
        evidence: [{
          message: "C# type policy found no exact runtime representation.",
        }],
      }
    : {
        kind: "resolved",
        carrier,
        evidence: [{
          message:
            "C# runtime representation resolved lazily from the checked source program and target policy.",
        }],
      };
}

export function getTargetTypeRefForNode(
  input: CsharpPlanningContext,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return input.types.policy.resolveNode(sourceNode, sourceFile);
}

export function getTargetTypeRefForType(
  input: CsharpPlanningContext,
  type: Type | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return input.types.policy.resolveType(type, sourceFile);
}

export function probeCarrierFromResolution(
  resolution: CsharpRuntimeCarrierResolution | undefined,
): TargetTypeRef | undefined {
  return resolution?.kind === "resolved" ? resolution.carrier : undefined;
}

export interface MissingCarrierDiagnosticDetail {
  readonly reason: string;
  readonly evidence: readonly string[];
}

export function missingCarrierDiagnosticDetail(
  resolution: CsharpRuntimeCarrierResolution | undefined,
  defaultReason: string,
): MissingCarrierDiagnosticDetail {
  if (resolution?.kind !== "missing") {
    return { reason: defaultReason, evidence: [] };
  }
  return {
    reason: resolution.reason,
    evidence: resolution.evidence.map((entry) => entry.message),
  };
}

export function pushMissingCarrierDiagnostic(
  diagnostics: TargetDiagnostic[],
  node: Node,
  message: string,
  resolution: CsharpRuntimeCarrierResolution | undefined,
  defaultReason: string,
): void {
  const detail = missingCarrierDiagnosticDetail(resolution, defaultReason);
  diagnostics.push(
    unsupportedNodeDiagnostic(
      node,
      `${message} ${detail.reason}`,
      detail.evidence,
    ),
  );
}
