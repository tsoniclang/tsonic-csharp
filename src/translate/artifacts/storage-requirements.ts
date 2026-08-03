import type {
  Node,
} from "@tsonic/tsts";
import type {
  SourceProgramNavigation,
  TargetArtifactContractGraph,
} from "@tsonic/target-api";
import {
  createTargetArtifactContractGraph,
} from "@tsonic/target-api";
import type {
  TargetTypeRef,
} from "../../policy/types/index.js";
import type {
  CsharpArtifactSnapshot,
  CsharpArtifactFacet,
} from "./contracts.js";
import {
  csharpStorageContractCandidate,
} from "./contracts.js";
import {
  csharpTargetStorageIdentityEquals,
  csharpNullableReferenceTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../policy/types/index.js";

export type CsharpStorageRequirement =
  | {
      readonly kind: "nullable-reference-write";
      readonly writtenType: TargetTypeRef;
    }
  | {
      readonly kind: "target-representation";
      readonly targetType: TargetTypeRef;
    };

export type CsharpStorageRequirementResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpStorageTypeResult =
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpUnfulfilledStorageRequirement {
  readonly expression: Node;
  readonly declaration: Node;
  readonly reason: string;
}

export interface CsharpStorageRequirementRegistry {
  readonly revision: number;
  require(
    storageExpression: Node,
    requirement: CsharpStorageRequirement,
  ): CsharpStorageRequirementResult;
  resolve(
    declaration: Node,
    sourceType: TargetTypeRef,
  ): CsharpStorageTypeResult;
  requiredType(storageExpression: Node): TargetTypeRef | undefined;
  contractOwner(storageExpression: Node): string | undefined;
  unfulfilled(): readonly CsharpUnfulfilledStorageRequirement[];
}

export interface CsharpStorageRequirementRegistryHost {
  readonly navigation: SourceProgramNavigation;
  artifactOwner(declaration: Node): string | undefined;
}

interface StoredRequirement {
  readonly expression: Node;
  readonly declaration: Node;
  readonly artifactOwner: string;
  nullableWrittenType?: TargetTypeRef;
  targetType?: TargetTypeRef;
  nullableConsumed: boolean;
  targetConsumed: boolean;
}

const maximumStorageRequirementCount = 131_072;
const accepted = Object.freeze({ kind: "accepted" as const });

export function createCsharpStorageRequirementRegistry(
  host: CsharpStorageRequirementRegistryHost,
  contracts: TargetArtifactContractGraph<
    CsharpArtifactFacet,
    CsharpArtifactSnapshot
  > = createTargetArtifactContractGraph<
    CsharpArtifactFacet,
    CsharpArtifactSnapshot
  >(),
): CsharpStorageRequirementRegistry {
  const requirements = new Map<Node, StoredRequirement>();

  function require(
    storageExpression: Node,
    requirement: CsharpStorageRequirement,
  ): CsharpStorageRequirementResult {
    if (requirement.kind === "nullable-reference-write") {
      const nullableType = csharpNullableReferenceTargetType(
        requirement.writtenType,
      );
      if (targetTypeRefEquals(nullableType, requirement.writtenType)) {
        return accepted;
      }
    }
    const reference = host.navigation.referenceFor(storageExpression);
    if (reference === undefined) {
      return rejected(
        requirement.kind === "target-representation"
          ? "A selected target operation requires an exact storage representation, but its source storage declaration is unavailable."
          : "A selected target output can write null, but its exact source storage declaration is unavailable.",
      );
    }
    const existing = requirements.get(reference.declaration);
    const artifactOwner = existing?.artifactOwner ??
      host.artifactOwner(reference.declaration);
    if (artifactOwner === undefined) {
      return rejected(
        "A selected target storage requirement has no exact source declaration identity.",
      );
    }
    const current = existing ?? {
      expression: storageExpression,
      declaration: reference.declaration,
      artifactOwner,
      nullableConsumed: false,
      targetConsumed: false,
    };
    if (existing === undefined) {
      if (requirements.size >= maximumStorageRequirementCount) {
        return rejected(
          `C# target storage requirements exceed their finite ${maximumStorageRequirementCount}-declaration budget.`,
        );
      }
    }
    if (requirement.kind === "target-representation") {
      if (
        current.targetType !== undefined &&
        !targetTypeRefEquals(current.targetType, requirement.targetType)
      ) {
        return rejected(
          `One source storage declaration requires incompatible target representations '${targetTypeRefKey(current.targetType)}' and '${targetTypeRefKey(requirement.targetType)}'.`,
        );
      }
      if (current.targetType === undefined) {
        const committed = commitStorageRequirement(
          current,
          requirement.targetType,
          current.nullableWrittenType,
        );
        if (committed.kind === "rejected") {
          return committed;
        }
        current.targetType = requirement.targetType;
        requirements.set(reference.declaration, current);
      }
      return accepted;
    }
    if (
      current.nullableWrittenType !== undefined &&
      !sameStorageIdentity(
        current.nullableWrittenType,
        requirement.writtenType,
      )
    ) {
      return rejected(
        `One source storage declaration is related to incompatible nullable target output types '${targetTypeRefKey(current.nullableWrittenType)}' and '${targetTypeRefKey(requirement.writtenType)}'.`,
      );
    }
    if (current.nullableWrittenType === undefined) {
      const committed = commitStorageRequirement(
        current,
        current.targetType,
        requirement.writtenType,
      );
      if (committed.kind === "rejected") {
        return committed;
      }
      current.nullableWrittenType = requirement.writtenType;
      requirements.set(reference.declaration, current);
    }
    return accepted;
  }

  function resolve(
    declaration: Node,
    sourceType: TargetTypeRef,
  ): CsharpStorageTypeResult {
    let requirement = requirements.get(declaration);
    if (requirement === undefined) {
      const artifactOwner = host.artifactOwner(declaration);
      if (artifactOwner === undefined) {
        return {
          kind: "rejected",
          reason:
            "An emitted C# storage declaration has no stable compiler-owned target artifact identity.",
        };
      }
      if (requirements.size >= maximumStorageRequirementCount) {
        return {
          kind: "rejected",
          reason:
            `C# target storage declarations exceed their finite ${maximumStorageRequirementCount}-declaration budget.`,
        };
      }
      const baseline: StoredRequirement = {
        expression: declaration,
        declaration,
        artifactOwner,
        nullableConsumed: false,
        targetConsumed: false,
      };
      const committed = commitStorageRequirement(
        baseline,
        undefined,
        undefined,
      );
      if (committed.kind === "rejected") {
        return committed;
      }
      requirements.set(declaration, baseline);
      requirement = baseline;
    }
    const targetType = requirement.targetType ?? sourceType;
    if (
      requirement.nullableWrittenType !== undefined &&
      !sameStorageIdentity(requirement.nullableWrittenType, targetType)
    ) {
      return {
        kind: "rejected",
        reason:
          `Selected target output writes '${targetTypeRefKey(requirement.nullableWrittenType)}', but its source storage declaration resolves to '${targetTypeRefKey(targetType)}'.`,
      };
    }
    requirement.targetConsumed = requirement.targetType !== undefined;
    requirement.nullableConsumed = requirement.nullableWrittenType !== undefined;
    return {
      kind: "resolved",
      type: requirement.nullableWrittenType === undefined
        ? targetType
        : csharpNullableReferenceTargetType(targetType),
    };
  }

  function requiredType(storageExpression: Node): TargetTypeRef | undefined {
    const reference = host.navigation.referenceFor(storageExpression);
    const requirement = requirements.get(
      reference?.declaration ?? storageExpression,
    );
    if (requirement === undefined) {
      return undefined;
    }
    const artifact = contracts.artifact(requirement.artifactOwner);
    if (artifact?.kind !== "storage") {
      return undefined;
    }
    const targetType = artifact.targetType ?? artifact.nullableWrittenType;
    if (targetType === undefined) {
      return undefined;
    }
    return artifact.nullableWrittenType === undefined
      ? targetType
      : csharpNullableReferenceTargetType(targetType);
  }

  function contractOwner(storageExpression: Node): string | undefined {
    const reference = host.navigation.referenceFor(storageExpression);
    return requirements.get(
      reference?.declaration ?? storageExpression,
    )?.artifactOwner;
  }

  function unfulfilled(): readonly CsharpUnfulfilledStorageRequirement[] {
    return Object.freeze(
      [...requirements.values()].flatMap((requirement) => [
        ...(
          requirement.targetType !== undefined && !requirement.targetConsumed
            ? [Object.freeze({
                expression: requirement.expression,
                declaration: requirement.declaration,
                reason:
                  "A selected target operation requires an exact storage representation, but no emitted C# storage declaration consumed that requirement.",
              })]
            : []
        ),
        ...(
          requirement.nullableWrittenType !== undefined &&
            !requirement.nullableConsumed
            ? [Object.freeze({
                expression: requirement.expression,
                declaration: requirement.declaration,
                reason:
                  "A selected target output can write null, but no emitted C# storage declaration consumed that exact requirement.",
              })]
            : []
        ),
      ]),
    );
  }

  return Object.freeze({
    get revision(): number {
      return contracts.revision;
    },
    require,
    resolve,
    requiredType,
    contractOwner,
    unfulfilled,
  });

  function commitStorageRequirement(
    requirement: StoredRequirement,
    targetType: TargetTypeRef | undefined,
    nullableWrittenType: TargetTypeRef | undefined,
  ): CsharpStorageRequirementResult {
    const candidate = csharpStorageContractCandidate(
      requirement.artifactOwner,
      targetType,
      nullableWrittenType,
    );
    const committed = contracts.commit(
      candidate.owner,
      candidate.contract,
      candidate.dependencies,
      candidate.artifact,
    );
    return committed.kind === "rejected"
      ? rejected(committed.reason)
      : accepted;
  }
}

const sameStorageIdentity = csharpTargetStorageIdentityEquals;

function rejected(reason: string): {
  readonly kind: "rejected";
  readonly reason: string;
} {
  return { kind: "rejected", reason };
}
