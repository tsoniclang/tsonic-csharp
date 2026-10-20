import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export interface CsharpRuntimeCarrierResolution {
  readonly kind: "resolved";
  readonly carrier: TargetTypeRef;
  readonly evidence: readonly CsharpRuntimeCarrierEvidence[];
}

export interface CsharpRuntimeCarrierEvidence {
  readonly message: string;
}

export function getRuntimeCarrierForExpression(
  input: CsharpPlanningContext, sourceNode: Node | undefined, sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return getTargetTypeRefForNode(input, sourceNode, sourceFile);
}

export function resolveRuntimeCarrierForExpression(
  input: CsharpPlanningContext, sourceNode: Node | undefined, sourceFile: SourceFile,
): CsharpRuntimeCarrierResolution | undefined {
  return resolveRuntimeCarrier(input, sourceNode, sourceFile, "value");
}

export function resolveRuntimeCarrierForStorage(
  input: CsharpPlanningContext, sourceNode: Node | undefined, sourceFile: SourceFile,
): CsharpRuntimeCarrierResolution | undefined {
  return resolveRuntimeCarrier(input, sourceNode, sourceFile, "storage");
}

function resolveRuntimeCarrier(
  input: CsharpPlanningContext, sourceNode: Node | undefined, _sourceFile: SourceFile, mode: "value" | "storage",
): CsharpRuntimeCarrierResolution | undefined {
  if (sourceNode === undefined) return undefined;
  const carrier = mode === "storage" ? input.program.records.storageType.get(sourceNode)
    : input.program.records.valueRead.get(sourceNode)?.value;
  if (carrier === undefined) failCsharpPlannerInvariant("An admitted native expression requires its exact sealed runtime carrier.", sourceNode);
  return { kind: "resolved", carrier, evidence: [{ message: "C# runtime representation is read from its sealed native carrier record." }] };
}

export function getTargetTypeRefForNode(
  input: CsharpPlanningContext, sourceNode: Node | undefined, _sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return sourceNode === undefined ? undefined : input.program.records.valueRead.get(sourceNode)?.value;
}

export function probeCarrierFromResolution(resolution: CsharpRuntimeCarrierResolution | undefined): TargetTypeRef | undefined {
  return resolution?.carrier;
}

export interface MissingCarrierDiagnosticDetail {
  readonly reason: string;
  readonly evidence: readonly string[];
}

export function missingCarrierDiagnosticDetail(
  _resolution: CsharpRuntimeCarrierResolution | undefined, defaultReason: string,
): MissingCarrierDiagnosticDetail {
  return { reason: defaultReason, evidence: [] };
}
