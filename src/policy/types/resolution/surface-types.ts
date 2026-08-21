import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpQualifiedTypeRenderShape,
} from "../render-shapes.js";
import {
  csharpTargetNamedType,
} from "../../../target-model/types/factories.js";

export const csharpJsArrayCarrierId = "Tsonic.CSharp.Js.JSArray`1";

export function csharpJsArrayTargetType(
  elementType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  const type = csharpTargetNamedType(
    csharpJsArrayCarrierId,
    [elementType],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSArray"),
    {
      arrayLiteralElementType: elementType,
      enumerableElementType: elementType,
      readOnlyIndexableElementType: elementType,
      denseMutableElementType: elementType,
      indexableLengthMemberName: "length",
      collectionSemantics: "js-sparse",
    },
  );
  return {
    ...type,
    csharpJsArrayMutation: {
      deleteAtMemberName: "deleteAt",
      setLengthMemberName: "setLength",
    },
    csharpPropertyKeyIteration: {
      kind: "index",
      lengthMemberName: "length",
      keyConversion: "invariant-string",
    },
  };
}

export function csharpJsMapTargetType(
  keyType: TargetTypeRef,
  valueType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  const entryType: TargetTypeRef = {
    kind: "tuple",
    elements: [keyType, valueType],
  };
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.Map`2",
      [keyType, valueType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Map"),
      { enumerableElementType: entryType },
    ),
    csharpJsSurfaceKind: "map",
  };
}

export function csharpJsSetTargetType(
  elementType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.Set`1",
      [elementType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Set"),
      { enumerableElementType: elementType },
    ),
    csharpJsSurfaceKind: "set",
  };
}

export function getCsharpJsMapTargetTypes(
  type: TargetTypeRef | undefined,
): {
  readonly key: TargetTypeRef;
  readonly value: TargetTypeRef;
} | undefined {
  if (
    type?.kind !== "target-named" ||
    (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind !== "map" ||
    type.typeArguments?.length !== 2
  ) {
    return undefined;
  }
  return {
    key: type.typeArguments[0]!,
    value: type.typeArguments[1]!,
  };
}

export function getCsharpJsSetElementTargetType(
  type: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return type?.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind === "set" &&
      type.typeArguments?.length === 1
    ? type.typeArguments[0]
    : undefined;
}

export function csharpJsDateTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.Date",
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Date"),
    ),
    csharpJsSurfaceKind: "date",
  };
}

export function csharpJsRegExpTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.RegExp",
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExp"),
    ),
    csharpJsSurfaceKind: "regexp",
  };
}

export function isCsharpJsRegExpTargetType(
  type: TargetTypeRef | undefined,
): type is CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "regexp";
} {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind === "regexp";
}

export function getCsharpJsArrayElementTargetType(
  type: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return type?.kind === "target-named" && type.id === csharpJsArrayCarrierId
    ? type.typeArguments?.[0]
    : undefined;
}

export function getCsharpJsArrayMutationPolicy(
  type: TargetTypeRef | undefined,
): CsharpTargetNamedTypeRef["csharpJsArrayMutation"] {
  return type?.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpCollectionSemantics ===
        "js-sparse"
    ? (type as CsharpTargetNamedTypeRef).csharpJsArrayMutation
    : undefined;
}
