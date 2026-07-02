import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetNamedTypeRef,
} from "./definitions.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";

export function csharpEnumerableTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  const constructionType = csharpListTargetType(elementType);
  return csharpTargetNamedType(
    "System.Collections.Generic.IEnumerable`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "IEnumerable"),
    { arrayLiteralElementType: elementType, arrayLiteralConstructionType: constructionType, enumerableElementType: elementType },
  );
}

export function csharpReadOnlyListTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  const constructionType = csharpListTargetType(elementType);
  return csharpTargetNamedType(
    "System.Collections.Generic.IReadOnlyList`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "IReadOnlyList"),
    { arrayLiteralElementType: elementType, arrayLiteralConstructionType: constructionType, enumerableElementType: elementType, readOnlyIndexableElementType: elementType },
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
