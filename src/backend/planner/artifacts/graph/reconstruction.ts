import type { CsharpArtifactGraphScope } from "./engine.js";
import type { CsharpArtifactRequestResult } from "./model.js";
import type { CsharpArtifactSnapshot, CsharpArtifactFacet } from "../contracts.js";
import type { TargetArtifactReconstruction } from "@tsonic/target-api/artifacts";
import {
  csharpGeneratedHelperContractCandidate,
  csharpObjectShapeContractCandidate,
} from "../contracts.js";
import { resolvedArtifact, accepted, rejected } from "./result.js";

export function reconstructArtifact(
  { contracts, records }: CsharpArtifactGraphScope,
  owner: string,
): TargetArtifactReconstruction<CsharpArtifactFacet, CsharpArtifactSnapshot> {
  const artifact = contracts.artifact(owner);
  if (artifact === undefined) {
    return {
      kind: "rejected",
      code: "CSHARP_TARGET_ARTIFACT_RECONSTRUCTOR_MISSING",
      reason: `Dirty C# target artifact '${owner}' has no published target-owned snapshot.`,
    };
  }
  switch (artifact.kind) {
    case "generated-helper":
      return resolvedArtifact(
        csharpGeneratedHelperContractCandidate(artifact.helper),
      );
    case "object-shape": {
      const record = records.get(owner);
      if (record === undefined) {
        return {
          kind: "rejected",
          code: "CSHARP_OBJECT_SHAPE_RECONSTRUCTOR_MISSING",
          reason:
            `Dirty C# object-shape artifact '${owner}' has no canonical target-owned shape record.`,
        };
      }
      return resolvedArtifact(csharpObjectShapeContractCandidate(
        owner,
        record.fact,
        record.materialization,
        record.capabilities,
        [...record.projections.values()],
        record.receiverBoundMethodKeys,
        [...record.dependencies].sort(),
      ));
    }
    case "source-file":
      return {
        kind: "rejected",
        code: "CSHARP_SOURCE_FILE_RECONSTRUCTOR_OWNERSHIP_INVALID",
        reason:
          `Dirty C# source-file artifact '${owner}' must be reconstructed by its source-file planner.`,
      };
  }
}


export function verifyContractClosure(
  { contracts }: CsharpArtifactGraphScope,
): CsharpArtifactRequestResult {
  if (contracts.hasPending()) {
    return rejected(
      "C# target artifact contracts retain dirty dependents after reconstruction.",
    );
  }
  const closure = contracts.verifyClosure();
  return closure.kind === "closed" ? accepted : rejected(closure.reason);
}
