import type {
  TargetTypeRef,
} from "../../target-model/types/model.js";
import type {
  CsharpTargetNamedTypeRef,
} from "../../target-model/types/model.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpTargetNamedType,
} from "../../target-model/types/factories.js";

export function csharpEnumerableTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  const constructionType = csharpListTargetType(elementType);
  return csharpTargetNamedType(
    "System.Collections.Generic.IEnumerable`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "IEnumerable"),
    {
      arrayLiteralElementType: elementType,
      arrayLiteralConstructionType: constructionType,
      implicitArrayInputElementType: elementType,
      enumerableElementType: elementType,
    },
  );
}

export function csharpReadOnlyListTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  const constructionType = csharpListTargetType(elementType);
  return csharpTargetNamedType(
    "System.Collections.Generic.IReadOnlyList`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "IReadOnlyList"),
    {
      arrayLiteralElementType: elementType,
      arrayLiteralConstructionType: constructionType,
      implicitArrayInputElementType: elementType,
      enumerableElementType: elementType,
      readOnlyIndexableElementType: elementType,
      indexableLengthMemberName: "Count",
      collectionSemantics: "dense",
    },
  );
}

export function csharpListTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  const type = csharpTargetNamedType(
    "System.Collections.Generic.List`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "List"),
    {
      arrayLiteralElementType: elementType,
      enumerableElementType: elementType,
      readOnlyIndexableElementType: elementType,
      denseMutableElementType: elementType,
      indexableLengthMemberName: "Count",
      collectionSemantics: "dense",
    },
  );
  return {
    ...type,
    csharpArrayLiteralConstructionType: type,
  };
}

export function getCsharpCollectionElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind === "array") {
    return type.element;
  }
  if (type?.kind !== "target-named") {
    return undefined;
  }
  return (type as CsharpTargetNamedTypeRef).csharpEnumerableElementType;
}

export function isCsharpReadOnlyIndexableCollectionTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "array" ||
    (type?.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpReadOnlyIndexableElementType !== undefined);
}

export function getCsharpReadOnlyIndexableCollectionElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind === "array") {
    return type.element;
  }
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const metadataElement = (type as CsharpTargetNamedTypeRef).csharpReadOnlyIndexableElementType;
  return metadataElement;
}

export function isCsharpDenseMutableCollectionTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpDenseMutableElementType !== undefined;
}

export function getCsharpArrayLiteralElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType
    : undefined;
}

export function getCsharpArrayLiteralConstructionTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpArrayLiteralConstructionType
    : undefined;
}

export function getCsharpImplicitArrayInputElementTargetType(
  type: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpImplicitArrayInputElementType
    : undefined;
}

export function getCsharpIndexableLengthMemberName(
  type: TargetTypeRef | undefined,
): string | undefined {
  if (type?.kind === "array") {
    return "Length";
  }
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpIndexableLengthMemberName
    : undefined;
}

export function csharpCollectionUsesJsArraySemantics(
  type: TargetTypeRef | undefined,
): boolean {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpCollectionSemantics ===
      "js-sparse";
}

export function isCsharpRecordDictionaryTargetType(
  type: TargetTypeRef | undefined,
): type is CsharpTargetNamedTypeRef & {
  readonly csharpCollectionSurface: "record";
} {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpCollectionSurface === "record";
}

export function csharpTupleElementMemberName(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error("C# tuple element indexes must be non-negative safe integers.");
  }
  return `Item${index + 1}`;
}
