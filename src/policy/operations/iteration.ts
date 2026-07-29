import type {
  Node,
  ResolvedSourceIterationInfo,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpObjectShapeFact,
  CsharpPropertyKeyIterationPolicy,
  CsharpStringIterationPolicy,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../types/index.js";
import {
  csharpStringTargetType,
  getCsharpCollectionElementTargetType,
  isCsharpRecordDictionaryTargetType,
  isCsharpStringTargetType,
  targetTypeRefEquals,
} from "../types/index.js";
import type {
  CsharpOperationSelection,
} from "./selection.js";

export type CsharpResolvedIteration =
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-of";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-of" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: { readonly kind: "foreach" };
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-of";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-of" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: {
        readonly kind: "string-code-point";
        readonly policy: CsharpStringIterationPolicy;
      };
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-in";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-in" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: {
        readonly kind: "object-shape-keys";
        readonly objectShape: CsharpObjectShapeFact;
      };
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-in";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-in" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: Extract<
        CsharpPropertyKeyIterationPolicy,
        { readonly kind: "index" }
      >;
    }
  | {
      readonly kind: "resolved";
      readonly iterationKind: "for-in";
      readonly source: Extract<
        ResolvedSourceIterationInfo,
        { readonly iterationKind: "for-in" }
      >;
      readonly iterableType: TargetTypeRef;
      readonly elementType: TargetTypeRef;
      readonly lowering: Extract<
        CsharpPropertyKeyIterationPolicy,
        { readonly kind: "key-collection" }
      >;
    };

export type CsharpForInIteration = Extract<
  CsharpResolvedIteration,
  { readonly iterationKind: "for-in" }
>;

export type CsharpForOfIteration = Extract<
  CsharpResolvedIteration,
  { readonly iterationKind: "for-of" }
>;

export function isCsharpObjectShapeKeyIteration(
  selection: CsharpForInIteration,
): selection is Extract<
  CsharpForInIteration,
  { readonly lowering: { readonly kind: "object-shape-keys" } }
> {
  return selection.lowering.kind === "object-shape-keys";
}

export function isCsharpKeyCollectionIteration(
  selection: CsharpForInIteration,
): selection is Extract<
  CsharpForInIteration,
  { readonly lowering: { readonly kind: "key-collection" } }
> {
  return selection.lowering.kind === "key-collection";
}

export function isCsharpIndexKeyIteration(
  selection: CsharpForInIteration,
): selection is Extract<
  CsharpForInIteration,
  { readonly lowering: { readonly kind: "index" } }
> {
  return selection.lowering.kind === "index";
}

export function isCsharpStringCodePointIteration(
  selection: CsharpForOfIteration,
): selection is Extract<
  CsharpForOfIteration,
  { readonly lowering: { readonly kind: "string-code-point" } }
> {
  return selection.lowering.kind === "string-code-point";
}

export function selectCsharpIteration(
  input: CsharpTranslationContext,
  statement: Node,
  expression: Node | undefined,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (expression === undefined) {
    return rejected("Checked iteration has no iterable expression.");
  }
  const source = input.queries(sourceFile).checker.getResolvedIterationInfo(
    statement,
  );
  if (source === undefined) {
    return rejected(
      "TSTS did not retain an exact checked iteration selection for this statement.",
    );
  }
  const iterableType = input.types.resolveNode(
    expression,
    sourceFile,
  );
  if (iterableType === undefined) {
    return rejected(
      "The checked iterable expression does not have a closed C# target representation.",
    );
  }
  if (source.iterationKind === "for-await-of") {
    return rejected(
      "C# async iteration requires an explicit asynchronous target iteration policy.",
    );
  }
  if (source.iterationKind === "for-of") {
    return selectForOf(source, iterableType);
  }
  const elementType = input.types.resolveType(
    source.sourceElementType,
    sourceFile,
  );
  if (elementType === undefined) {
    return rejected(
      "The checked property-key type does not have a closed C# target representation.",
    );
  }
  return selectForIn(input, source, expression, sourceFile, iterableType, elementType);
}

function selectForOf(
  source: Extract<ResolvedSourceIterationInfo, { readonly iterationKind: "for-of" }>,
  iterableType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (isCsharpStringTargetType(iterableType)) {
    const policy = (iterableType as CsharpTargetNamedTypeRef)
      .csharpStringIteration;
    return policy === undefined
      ? rejected(
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
    return rejected(
      "The selected C# iterable representation does not prove an enumerable target element.",
    );
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
  input: CsharpTranslationContext,
  source: Extract<ResolvedSourceIterationInfo, { readonly iterationKind: "for-in" }>,
  expression: Node,
  sourceFile: SourceFile,
  iterableType: TargetTypeRef,
  elementType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (!targetTypeRefEquals(elementType, csharpStringTargetType())) {
    return rejected(
      "C# property-key iteration requires the checked source key to map exactly to string.",
    );
  }
  const objectShape = input.objectShapes.resolveNode(expression, sourceFile);
  if (objectShape !== undefined) {
    return {
      kind: "resolved",
      iterationKind: "for-in",
      source,
      iterableType,
      elementType,
      lowering: { kind: "object-shape-keys", objectShape },
    };
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
  if (iterableType.kind !== "target-named") {
    return rejected(
      "The selected C# representation has no property-key iteration policy.",
    );
  }
  const policy = (iterableType as CsharpTargetNamedTypeRef)
    .csharpPropertyKeyIteration;
  if (policy === undefined) {
    return rejected(
      "The selected C# representation has no property-key iteration policy.",
    );
  }
  if (
    policy.kind === "key-collection" &&
    !isCsharpRecordDictionaryTargetType(iterableType)
  ) {
    return rejected(
      "A key-collection iteration policy requires an explicit record-dictionary target representation.",
    );
  }
  return policy.kind === "index"
    ? {
        kind: "resolved",
        iterationKind: "for-in",
        source,
        iterableType,
        elementType,
        lowering: policy,
      }
    : {
        kind: "resolved",
        iterationKind: "for-in",
        source,
        iterableType,
        elementType,
        lowering: policy,
      };
}

function rejected(
  reason: string,
): Extract<CsharpOperationSelection<never>, { readonly kind: "rejected" }> {
  return { kind: "rejected", reason };
}
