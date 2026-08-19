import type { CsharpArtifactContractCandidate, CsharpArtifactSnapshot, CsharpArtifactFacet } from "../contracts.js";
import type { TargetArtifactReconstruction } from "@tsonic/target-api/artifacts";

export function resolvedArtifact(
  candidate: CsharpArtifactContractCandidate,
): TargetArtifactReconstruction<CsharpArtifactFacet, CsharpArtifactSnapshot> {
  return {
    kind: "resolved",
    contract: candidate.contract,
    dependencies: candidate.dependencies,
    artifact: candidate.artifact,
  };
}


export const accepted = Object.freeze({ kind: "accepted" as const });


export function rejected(reason: string): {
  readonly kind: "rejected";
  readonly reason: string;
} {
  return { kind: "rejected", reason };
}
