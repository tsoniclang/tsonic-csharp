import { createTargetArtifactContractGraph } from "@tsonic/target-api/artifacts";
import type { TargetArtifactContractGraph } from "@tsonic/target-api/artifacts";
import type {
  CsharpArtifactSnapshot,
  CsharpArtifactFacet,
} from "./contracts.js";
import {
  csharpGeneratedHelperContractCandidate,
} from "./contracts.js";

export const csharpGeneratedHelperNamespace = "Tsonic.CSharp.Generated";
export const csharpGeneratedConversionHelperName = "__TsonicConversions";

export type CsharpGeneratedHelper =
  | "lifted-provider-argument-adapter";

export type CsharpGeneratedHelperRequestResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpGeneratedHelperRegistry {
  readonly revision: number;
  require(helper: CsharpGeneratedHelper): CsharpGeneratedHelperRequestResult;
  required(): readonly CsharpGeneratedHelper[];
}

const maximumGeneratedHelperCount = 64;

export function createCsharpGeneratedHelperRegistry(
  contracts: TargetArtifactContractGraph<
    CsharpArtifactFacet,
    CsharpArtifactSnapshot
  > = createTargetArtifactContractGraph<
    CsharpArtifactFacet,
    CsharpArtifactSnapshot
  >(),
):
  CsharpGeneratedHelperRegistry {
  const helpers = new Set<CsharpGeneratedHelper>();

  function require(
    helper: CsharpGeneratedHelper,
  ): CsharpGeneratedHelperRequestResult {
    if (helpers.has(helper)) {
      return accepted;
    }
    if (helpers.size >= maximumGeneratedHelperCount) {
      return {
        kind: "rejected",
        reason:
          `C# generated helpers exceed their finite ${maximumGeneratedHelperCount}-helper budget.`,
      };
    }
    const candidate = csharpGeneratedHelperContractCandidate(helper);
    const committed = contracts.commit(
      candidate.owner,
      candidate.contract,
      candidate.dependencies,
      candidate.artifact,
    );
    if (committed.kind === "rejected") {
      return { kind: "rejected", reason: committed.reason };
    }
    helpers.add(helper);
    return accepted;
  }

  return Object.freeze({
    get revision(): number {
      return contracts.revision;
    },
    require,
    required(): readonly CsharpGeneratedHelper[] {
      return Object.freeze(
        [...helpers].sort((left, right) => left.localeCompare(right)),
      );
    },
  });
}

const accepted = Object.freeze({ kind: "accepted" as const });
