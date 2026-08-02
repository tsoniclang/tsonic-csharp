import type {
  Node,
} from "@tsonic/tsts";
import type {
  SourceProgramNavigation,
} from "@tsonic/target-api";
import type {
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  csharpNullableReferenceTargetType,
  isCsharpNullableReferenceTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
  withoutCsharpNullableReference,
} from "../../policy/types/index.js";

export type CsharpStorageRequirement = {
  readonly kind: "nullable-reference-write";
  readonly writtenType: TargetTypeRef;
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
  unfulfilled(): readonly CsharpUnfulfilledStorageRequirement[];
}

export interface CsharpStorageRequirementRegistryHost {
  readonly navigation: SourceProgramNavigation;
}

interface StoredRequirement {
  readonly expression: Node;
  readonly declaration: Node;
  readonly writtenType: TargetTypeRef;
  consumed: boolean;
}

const maximumStorageRequirementCount = 131_072;
const accepted = Object.freeze({ kind: "accepted" as const });

export function createCsharpStorageRequirementRegistry(
  host: CsharpStorageRequirementRegistryHost,
): CsharpStorageRequirementRegistry {
  const requirements = new Map<Node, StoredRequirement>();
  let revision = 0;

  function require(
    storageExpression: Node,
    requirement: CsharpStorageRequirement,
  ): CsharpStorageRequirementResult {
    const nullableType = csharpNullableReferenceTargetType(
      requirement.writtenType,
    );
    if (targetTypeRefEquals(nullableType, requirement.writtenType)) {
      return accepted;
    }
    const reference = host.navigation.referenceFor(storageExpression);
    if (reference === undefined) {
      return rejected(
        "A selected target output can write null, but its exact source storage declaration is unavailable.",
      );
    }
    const current = requirements.get(reference.declaration);
    if (current !== undefined) {
      return sameStorageIdentity(current.writtenType, requirement.writtenType)
        ? accepted
        : rejected(
            `One source storage declaration is related to incompatible target output types '${targetTypeRefKey(current.writtenType)}' and '${targetTypeRefKey(requirement.writtenType)}'.`,
          );
    }
    if (requirements.size >= maximumStorageRequirementCount) {
      return rejected(
        `C# target storage requirements exceed their finite ${maximumStorageRequirementCount}-declaration budget.`,
      );
    }
    requirements.set(reference.declaration, {
      expression: storageExpression,
      declaration: reference.declaration,
      writtenType: requirement.writtenType,
      consumed: false,
    });
    revision += 1;
    return accepted;
  }

  function resolve(
    declaration: Node,
    sourceType: TargetTypeRef,
  ): CsharpStorageTypeResult {
    const requirement = requirements.get(declaration);
    if (requirement === undefined) {
      return { kind: "resolved", type: sourceType };
    }
    if (!sameStorageIdentity(requirement.writtenType, sourceType)) {
      return {
        kind: "rejected",
        reason:
          `Selected target output writes '${targetTypeRefKey(requirement.writtenType)}', but its source storage declaration resolves to '${targetTypeRefKey(sourceType)}'.`,
      };
    }
    requirement.consumed = true;
    return {
      kind: "resolved",
      type: csharpNullableReferenceTargetType(sourceType),
    };
  }

  function unfulfilled(): readonly CsharpUnfulfilledStorageRequirement[] {
    return Object.freeze(
      [...requirements.values()]
        .filter((requirement) => !requirement.consumed)
        .map((requirement) => Object.freeze({
          expression: requirement.expression,
          declaration: requirement.declaration,
          reason:
            "A selected target output can write null, but no emitted C# storage declaration consumed that exact requirement.",
        })),
    );
  }

  return Object.freeze({
    get revision(): number {
      return revision;
    },
    require,
    resolve,
    unfulfilled,
  });
}

function sameStorageIdentity(
  left: TargetTypeRef,
  right: TargetTypeRef,
): boolean {
  const leftIdentity = isCsharpNullableReferenceTargetType(left)
    ? withoutCsharpNullableReference(left)
    : left;
  const rightIdentity = isCsharpNullableReferenceTargetType(right)
    ? withoutCsharpNullableReference(right)
    : right;
  return targetTypeRefEquals(leftIdentity, rightIdentity);
}

function rejected(reason: string): {
  readonly kind: "rejected";
  readonly reason: string;
} {
  return { kind: "rejected", reason };
}
