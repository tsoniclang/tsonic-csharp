import type { CsharpForInKeyBinding, CsharpResolvedIteration } from "../../../target-model/records/selection.js";
import type {
  AstReader,
  Node,
  ResolvedSourceIterationInfo,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../model/context.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/index.js";
import {
  csharpStringTargetType,
  getCsharpCollectionElementTargetType,
  isCsharpRecordDictionaryTargetType,
  isCsharpStringTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";
import type { CsharpOperationSelection } from "../../../target-model/records/operator-selection.js";
import type { CsharpConversionClassifications } from "../../../target-model/records/conversions.js";
import type { CsharpStorageRepresentationClassifications } from "../../../target-model/records/storage.js";
import { csharpConversionIsApplicable } from "../../../target-model/conversions/selection.js";
import { csharpTargetTypeRenderingRejection } from "../../types/model/renderability.js";

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
  selection: CsharpForOfIteration | CsharpForAwaitOfIteration,
): selection is Extract<
  CsharpForOfIteration | CsharpForAwaitOfIteration,
  { readonly lowering: { readonly kind: "string-code-point" } }
> {
  return selection.lowering.kind === "string-code-point";
}

export function selectCsharpIteration(
  input: CsharpPolicyContext,
  statement: Node,
  expression: Node | undefined,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (expression === undefined) {
    return rejected("Checked iteration has no iterable expression.");
  }
  const source = input.semantics(sourceFile).operations.iteration(
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
    return selectForAwaitOf(source, iterableType);
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
      ? rejected(
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
    return rejected(
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
      return rejected(
        "The exact source string iteration mechanism requires a selected target string carrier.",
      );
    case "union":
      return rejected(
        "For-await union iteration requires every exact source alternative to select one target iteration policy.",
      );
    case "untyped-dynamic-iteration":
      return rejected(
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
  input: CsharpPolicyContext,
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
          return rejected(
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
  const objectShape = input.objectShapes.resolveNode(expression, sourceFile);
  return objectShape === undefined
    ? rejected(
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

export function selectCsharpForInKeyBinding(
  input: {
    readonly ast: AstReader;
    readonly navigation: Pick<CsharpPolicyContext["navigation"], "sourceReferenceFor">;
    readonly storage: Pick<CsharpStorageRepresentationClassifications, "storageType">;
    readonly conversions: Pick<CsharpConversionClassifications, "conversion">;
  },
  statement: Node,
  iteration: Extract<CsharpResolvedIteration, { readonly iterationKind: "for-in" }>,
): { readonly kind: "resolved"; readonly binding: CsharpForInKeyBinding }
  | { readonly kind: "rejected"; readonly reason: string } {
  const { ast } = input;
  const initializer = ast.as.AsForInOrOfStatement(statement)?.Initializer;
  if (initializer === undefined) return { kind: "rejected", reason: "For-in statement has no initializer." };
  let selected: Omit<Extract<CsharpForInKeyBinding, { readonly kind: "declaration" }>, "storageType" | "conversion">
    | Omit<Extract<CsharpForInKeyBinding, { readonly kind: "assignment" }>, "storageType" | "conversion">;
  if (ast.is.IsVariableDeclarationList(initializer)) {
    const declarations = ast.children(initializer).filter((node): node is Node => node !== undefined && ast.is.IsVariableDeclaration(node));
    const declaration = declarations[0];
    if (declaration === undefined || declarations.length !== 1) return {
      kind: "rejected", reason: "For-in variable declaration must contain exactly one binding.",
    };
    const variable = ast.as.AsVariableDeclaration(declaration);
    if (variable?.Initializer !== undefined) return {
      kind: "rejected", reason: "For-in variable declaration cannot have an initializer.",
    };
    const name = variable?.name;
    if (name === undefined || !ast.is.IsIdentifier(name)) return {
      kind: "rejected", reason: "For-in C# key binding must be an identifier; binding patterns require finalized object-key destructuring facts.",
    };
    const declarationKind = ast.variableDeclarationKind(initializer);
    if (declarationKind !== "var" && declarationKind !== "let" && declarationKind !== "const") return {
      kind: "rejected", reason: "For-in C# key bindings require an exact var, let, or const declaration kind.",
    };
    selected = { kind: "declaration", node: declaration, name, declaration, declarationKind };
  } else if (ast.is.IsIdentifier(initializer)) {
    const declaration = input.navigation.sourceReferenceFor(initializer)?.declaration;
    if (declaration === undefined) return {
      kind: "rejected", reason: "A for-in assignment requires its exact checked storage declaration.",
    };
    selected = { kind: "assignment", node: initializer, name: initializer, declaration };
  } else return { kind: "rejected", reason: "For-in initializer binding is outside the current C# planning surface." };
  const storageType = input.storage.storageType.get(selected.declaration);
  if (storageType === undefined || csharpTargetTypeRenderingRejection(storageType) !== undefined) return {
    kind: "rejected", reason: "The exact for-in binding storage representation is not renderable in C#.",
  };
  const conversion = input.conversions.conversion.get(iteration.elementType, storageType, "implicit");
  if (conversion === undefined) return {
    kind: "rejected", reason: "For-in key assignment requires its closed implicit native storage conversion.",
  };
  if (conversion.kind === "rejected" || conversion.kind === "ambiguous") return { kind: "rejected", reason: conversion.reason };
  if (!csharpConversionIsApplicable(conversion, "implicit")) return {
    kind: "rejected", reason: "For-in key assignment requires an implicit native storage conversion.",
  };
  return { kind: "resolved", binding: Object.freeze({ ...selected, storageType, conversion }) };
}

function rejected(
  reason: string,
): Extract<CsharpOperationSelection<never>, { readonly kind: "rejected" }> {
  return { kind: "rejected", reason };
}
