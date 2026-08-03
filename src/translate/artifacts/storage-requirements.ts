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
  unfulfilled(): readonly CsharpUnfulfilledStorageRequirement[];
}

export interface CsharpStorageRequirementRegistryHost {
  readonly navigation: SourceProgramNavigation;
}

interface StoredRequirement {
  readonly expression: Node;
  readonly declaration: Node;
  nullableWrittenType?: TargetTypeRef;
  targetType?: TargetTypeRef;
  nullableConsumed: boolean;
  targetConsumed: boolean;
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
    const current = requirements.get(reference.declaration) ?? {
      expression: storageExpression,
      declaration: reference.declaration,
      nullableConsumed: false,
      targetConsumed: false,
    };
    if (!requirements.has(reference.declaration)) {
      if (requirements.size >= maximumStorageRequirementCount) {
        return rejected(
          `C# target storage requirements exceed their finite ${maximumStorageRequirementCount}-declaration budget.`,
        );
      }
      requirements.set(reference.declaration, current);
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
        current.targetType = requirement.targetType;
        revision += 1;
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
      current.nullableWrittenType = requirement.writtenType;
      revision += 1;
    }
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
    return reference === undefined
      ? undefined
      : requirements.get(reference.declaration)?.targetType;
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
      return revision;
    },
    require,
    resolve,
    requiredType,
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
