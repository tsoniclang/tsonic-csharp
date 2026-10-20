import type { CsharpResolvedIteration } from "../../../target-model/records/selection.js";

import type { ResolvedSourceIterationInfo } from "@tsonic/tsts";

import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/index.js";
import { csharpStringTargetType, getCsharpCollectionElementTargetType, isCsharpRecordDictionaryTargetType, isCsharpStringTargetType, targetTypeRefEquals } from "../../types/index.js";
import type { CsharpOperationSelection } from "../../../target-model/records/operator-selection.js";
import { csharpCollectionElementRead } from "../../../target-model/types/carriers/collection-reads.js";
import { getCsharpIndexableLengthMemberName } from "../../../target-model/types/carriers/collections.js";

import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
export type CsharpForInIteration = Extract<
  CsharpResolvedIteration,
  { readonly iterationKind: "for-in" }
>;

export type CsharpForOfIteration = Extract<
  CsharpResolvedIteration,
  { readonly iterationKind: "for-of" }
>;

export type CsharpForAwaitOfIteration = Extract<
  CsharpResolvedIteration,
  { readonly iterationKind: "for-await-of" }
>;

export function selectCsharpNativeIteration(
  source: ResolvedSourceIterationInfo,
  iterableType: TargetTypeRef,
  elementType: TargetTypeRef | undefined,
  objectShape: CsharpObjectShapeFact | undefined,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (source.iterationKind === "for-await-of") return selectForAwaitOf(source, iterableType);
  if (source.iterationKind === "for-of") return selectForOf(source, iterableType);
  return elementType === undefined ? rejectCsharpIteration("The checked property-key type does not have a closed C# target representation.")
    : selectForIn(source, iterableType, elementType, objectShape);
}

function selectForAwaitOf(
  source: Extract<
    ResolvedSourceIterationInfo,
    { readonly iterationKind: "for-await-of" }
  >,
  iterableType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (
    isCsharpStringTargetType(iterableType) &&
    (
      source.mechanism.kind === "string-code-unit-index-adapted-to-async" ||
      source.mechanism.kind === "synchronous-iterator-adapted-to-async"
    )
  ) {
    const policy = (iterableType as CsharpTargetNamedTypeRef)
      .csharpStringIteration;
    return policy === undefined
      ? rejectCsharpIteration(
          "The selected C# string representation has no exact code-point iteration policy.",
        )
      : {
          kind: "resolved",
          iterationKind: "for-await-of",
          source,
          iterableType,
          elementType: csharpStringTargetType(),
          lowering: { kind: "string-code-point", policy },
        };
  }
  const elementType = getCsharpCollectionElementTargetType(iterableType);
  if (elementType === undefined) {
    return rejectCsharpIteration(
      "The selected C# async-iterable representation does not prove an enumerable target element.",
    );
  }
  switch (source.mechanism.kind) {
    case "asynchronous-iterator-protocol":
      return {
        kind: "resolved",
        iterationKind: "for-await-of",
        source,
        iterableType,
        elementType,
        lowering: { kind: "await-foreach" },
      };
    case "synchronous-iterator-adapted-to-async":
    case "array-like-index-adapted-to-async":
      return {
        kind: "resolved",
        iterationKind: "for-await-of",
        source,
        iterableType,
        elementType,
        lowering: { kind: "await-foreach-sync-adapter" },
      };
    case "string-code-unit-index-adapted-to-async":
      return rejectCsharpIteration(
        "The exact source string iteration mechanism requires a selected target string carrier.",
      );
    case "union":
      return rejectCsharpIteration(
        "For-await union iteration requires every exact source alternative to select one target iteration policy.",
      );
    case "untyped-dynamic-iteration":
      return rejectCsharpIteration(
        "Untyped dynamic for-await iteration has no closed C# target protocol.",
      );
  }
}

function selectForOf(
  source: Extract<ResolvedSourceIterationInfo, { readonly iterationKind: "for-of" }>,
  iterableType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (isCsharpStringTargetType(iterableType)) {
    const policy = (iterableType as CsharpTargetNamedTypeRef)
      .csharpStringIteration;
    return policy === undefined
      ? rejectCsharpIteration(
          "The selected C# string representation has no exact code-point iteration policy.",
        )
      : {
          kind: "resolved",
          iterationKind: "for-of",
          source,
          iterableType,
          elementType: csharpStringTargetType(),
          lowering: { kind: "string-code-point", policy },
        };
  }
  const enumerableElement = getCsharpCollectionElementTargetType(iterableType);
  if (enumerableElement === undefined) {
    return rejectCsharpIteration(
      "The selected C# iterable representation does not prove an enumerable target element.",
    );
  }
  const read = csharpCollectionElementRead(iterableType);
  if (read?.kind === "invalid") return rejectCsharpIteration(read.reason);
  if (read?.kind === "method") {
    const lengthMemberName = getCsharpIndexableLengthMemberName(iterableType);
    if (lengthMemberName === undefined) return rejectCsharpIteration("A native indexed for-of carrier has no C# length member, element read or type syntax.");
    return { kind: "resolved", iterationKind: "for-of", source, iterableType, elementType: enumerableElement,
      lowering: { kind: "indexed", lengthMemberName, member: read.member } };
  }
  return {
    kind: "resolved",
    iterationKind: "for-of",
    source,
    iterableType,
    elementType: enumerableElement,
    lowering: { kind: "foreach" },
  };
}

function selectForIn(
  source: Extract<ResolvedSourceIterationInfo, { readonly iterationKind: "for-in" }>,
  iterableType: TargetTypeRef,
  elementType: TargetTypeRef,
  objectShape: CsharpObjectShapeFact | undefined,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (!targetTypeRefEquals(elementType, csharpStringTargetType())) {
    return rejectCsharpIteration(
      "C# property-key iteration requires the checked source key to map exactly to string.",
    );
  }
  if (iterableType.kind === "array") {
    return {
      kind: "resolved",
      iterationKind: "for-in",
      source,
      iterableType,
      elementType,
      lowering: {
        kind: "index",
        lengthMemberName: "Length",
        keyConversion: "invariant-string",
      },
    };
  }
  if (iterableType.kind === "target-named") {
    const targetPolicy = (iterableType as CsharpTargetNamedTypeRef)
      .csharpPropertyKeyIteration;
    if (targetPolicy !== undefined) {
      if (targetPolicy.kind === "key-collection") {
        if (!isCsharpRecordDictionaryTargetType(iterableType)) {
          return rejectCsharpIteration(
            "A key-collection iteration policy requires an explicit record-dictionary target representation.",
          );
        }
        return {
          kind: "resolved",
          iterationKind: "for-in",
          source,
          iterableType,
          elementType,
          lowering: targetPolicy,
        };
      }
      return {
        kind: "resolved",
        iterationKind: "for-in",
        source,
        iterableType,
        elementType,
        lowering: targetPolicy,
      };
    }
  }
  return objectShape === undefined
    ? rejectCsharpIteration(
        "The selected C# representation has no property-key iteration policy.",
      )
    : {
        kind: "resolved",
        iterationKind: "for-in",
        source,
        iterableType,
        elementType,
        lowering: { kind: "object-shape-keys", objectShape },
      };
}

export function rejectCsharpIteration(
  reason: string,
): Extract<CsharpOperationSelection<never>, { readonly kind: "rejected" }> {
  return { kind: "rejected", reason };
}
