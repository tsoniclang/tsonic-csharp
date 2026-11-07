import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedIteration } from "../../../target-model/records/operations/selection.js";

import type { SourceIterationSelection } from "@tsonic/target-api/source";

// The Host iteration selection (facts.selections.iteration) with its statement form (request R-F3-B3: `form`, and the
// "property-keys" protocol for for-in). Union and untyped-dynamic iteration are Host refusals before C# runs.
type CsharpIterationSource = SourceIterationSelection;

import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/index.js";
import { csharpStringTargetType, getCsharpCollectionElementTargetType, isCsharpRecordDictionaryTargetType, isCsharpStringTargetType, targetTypeRefEquals } from "../../types/index.js";
import type { CsharpOperationSelection } from "../../../target-model/records/operations/operator-selection.js";
import { csharpCollectionElementRead } from "../collections/element-reads.js";
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
  source: CsharpIterationSource,
  iterableType: TargetTypeRef,
  elementType: TargetTypeRef | undefined,
  objectShape: CsharpObjectShapeFact | undefined,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (source.form === "for-await-of") return selectForAwaitOf(source, iterableType);
  if (source.form === "for-of") return selectForOf(source, iterableType);
  if (source.form !== "for-in") failTargetAnalysisInvariant("tsonic-csharp",
    "A spread, destructuring or yield* iteration is not a loop iteration.", source.statement);
  return elementType === undefined ? rejectCsharpIteration("The published property-key type does not have a closed C# target representation.")
    : selectForIn(source, iterableType, elementType, objectShape);
}

function selectForAwaitOf(
  source: CsharpIterationSource,
  iterableType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (
    isCsharpStringTargetType(iterableType) &&
    (
      source.protocol === "string" || source.protocol === "iterator"
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
  switch (source.protocol) {
    case "async-iterator":
      return {
        kind: "resolved",
        iterationKind: "for-await-of",
        source,
        iterableType,
        elementType,
        lowering: { kind: "await-foreach" },
      };
    case "iterator":
    case "array":
      return {
        kind: "resolved",
        iterationKind: "for-await-of",
        source,
        iterableType,
        elementType,
        lowering: { kind: "await-foreach-sync-adapter" },
      };
    case "string":
      return rejectCsharpIteration(
        "The exact source string iteration mechanism requires a selected target string carrier.",
      );
    case "property-keys":
      return failTargetAnalysisInvariant("tsonic-csharp", "A for-await-of iteration has no property-key protocol.", source.statement);
  }
}

function selectForOf(
  source: CsharpIterationSource,
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
  source: CsharpIterationSource,
  iterableType: TargetTypeRef,
  elementType: TargetTypeRef,
  objectShape: CsharpObjectShapeFact | undefined,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (!targetTypeRefEquals(elementType, csharpStringTargetType())) {
    return rejectCsharpIteration(
      "C# property-key iteration requires the published source key to map exactly to string.",
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
