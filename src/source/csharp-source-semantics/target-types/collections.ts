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
  return csharpTargetNamedType(
    "System.Collections.Generic.IEnumerable`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "IEnumerable"),
    { arrayLiteralElementType: elementType },
  );
}

export function csharpReadOnlyListTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "System.Collections.Generic.IReadOnlyList`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "IReadOnlyList"),
    { arrayLiteralElementType: elementType },
  );
}

export function csharpListTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "System.Collections.Generic.List`1",
    [elementType],
    csharpQualifiedTypeRenderShape("System.Collections.Generic", "List"),
    { arrayLiteralElementType: elementType },
  );
}

export function getCsharpCollectionElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind === "array") {
    return type.element;
  }
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const id = type.id;
  if (
    id !== "System.Collections.Generic.IEnumerable`1" &&
    id !== "System.Collections.Generic.IReadOnlyList`1" &&
    id !== "System.Collections.Generic.IList`1" &&
    id !== "System.Collections.Generic.List`1"
  ) {
    return undefined;
  }
  const typeArguments = type.typeArguments ?? [];
  return typeArguments.length === 1 ? typeArguments[0] : undefined;
}

export function isCsharpReadOnlyIndexableCollectionTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "array" ||
    (type?.kind === "target-named" &&
      (
        type.id === "System.Collections.Generic.IReadOnlyList`1" ||
        type.id === "System.Collections.Generic.IList`1" ||
        type.id === "System.Collections.Generic.List`1"
      ));
}

export function isCsharpDenseMutableCollectionTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type.id === "System.Collections.Generic.List`1" || type.id === "System.Collections.Generic.IList`1");
}

export function getCsharpArrayLiteralElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType
    : undefined;
}
