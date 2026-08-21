import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import type {
  CsharpNullableReferenceTargetTypeRef,
  CsharpTargetNamedTypeRef,
} from "../../../target-model/types/model.js";
import {
  isCsharpValueTypeTargetType,
} from "../model/identity.js";
import {
  csharpTargetNamedType,
} from "../../../target-model/types/factories.js";

export function csharpNullableValueTargetType(elementType: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Nullable`1", [elementType], { kind: "nullable" }, {
    specialType: "nullable",
    valueType: true,
  });
}

export function getCsharpNullableElementTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (isCsharpNullableReferenceTargetType(type)) {
    return withoutCsharpNullableReference(type);
  }
  if (type?.kind !== "target-named" || (type as CsharpTargetNamedTypeRef).csharpSpecialType !== "nullable") {
    return undefined;
  }
  const typeArguments = type.typeArguments ?? [];
  return typeArguments.length === 1 ? typeArguments[0] : undefined;
}

export function csharpNullableTargetType(type: TargetTypeRef): TargetTypeRef {
  if (
    getCsharpNullableElementTargetType(type) !== undefined ||
    type.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpAbsorbsNullish === true
  ) {
    return type;
  }
  if (isCsharpValueTypeTargetType(type)) {
    return csharpNullableValueTargetType(type);
  }
  return csharpNullableReferenceTargetType(type);
}

export function csharpNullableReferenceTargetType(type: TargetTypeRef): TargetTypeRef {
  if (isCsharpNullableReferenceTargetType(type) || isCsharpValueTypeTargetType(type)) {
    return type;
  }
  const nullableReference: CsharpNullableReferenceTargetTypeRef = {
    ...type,
    csharpNullableReference: true,
  };
  return nullableReference;
}

export function isCsharpNullableReferenceTargetType(type: TargetTypeRef | undefined): type is CsharpNullableReferenceTargetTypeRef {
  return (type as { readonly csharpNullableReference?: unknown } | undefined)?.csharpNullableReference === true;
}

export function withoutCsharpNullableReference(type: CsharpNullableReferenceTargetTypeRef): TargetTypeRef {
  const { csharpNullableReference: _csharpNullableReference, ...baseType } = type;
  return baseType;
}
