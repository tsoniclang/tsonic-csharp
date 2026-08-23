import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpQualifiedTypeRenderShape,
} from "../../../target-model/types/render-shapes.js";
import {
  csharpTargetNamedType,
} from "../../../target-model/types/factories.js";
import { csharpNullableTargetType } from "../../../target-model/types/nullable.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../../../target-model/types/scalar-types.js";

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

export function csharpJsRegExpExecArrayTargetType(): CsharpTargetNamedTypeRef {
  return csharpJsRegExpArrayTargetType(
    "Tsonic.CSharp.Js.RegExpExecArray",
    "RegExpExecArray",
    csharpJsRegExpMatchArrayTargetType(),
  );
}

export function csharpJsRegExpMatchArrayTargetType(): CsharpTargetNamedTypeRef {
  return csharpJsRegExpArrayTargetType(
    "Tsonic.CSharp.Js.RegExpMatchArray",
    "RegExpMatchArray",
  );
}

export function csharpJsRegExpIndicesArrayTargetType(): CsharpTargetNamedTypeRef {
  const pair: TargetTypeRef = {
    kind: "tuple",
    elements: [
      csharpSourcePrimitiveTargetType("float64"),
      csharpSourcePrimitiveTargetType("float64"),
    ],
  };
  return csharpJsArrayLikeTargetType(
    "Tsonic.CSharp.Js.RegExpIndicesArray",
    "RegExpIndicesArray",
    csharpNullableTargetType(pair),
  );
}

export function csharpJsRegExpNamedGroupsTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.RegExpNamedGroups",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpNamedGroups"),
  );
}

export function csharpJsRegExpNamedIndicesTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.RegExpNamedIndices",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpNamedIndices"),
  );
}

export function csharpJsRegExpStringIteratorTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.RegExpStringIterator",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpStringIterator"),
    { enumerableElementType: csharpJsRegExpExecArrayTargetType() },
  );
}

function csharpJsRegExpArrayTargetType(
  id: string,
  name: string,
  baseType?: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return csharpJsArrayLikeTargetType(
    id,
    name,
    csharpNullableTargetType(csharpStringTargetType()),
    baseType,
  );
}

function csharpJsArrayLikeTargetType(
  id: string,
  name: string,
  elementType: TargetTypeRef,
  baseType?: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  const type = csharpTargetNamedType(
    id,
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name),
    {
      enumerableElementType: elementType,
      readOnlyIndexableElementType: elementType,
      denseMutableElementType: elementType,
      indexableLengthMemberName: "length",
      collectionSemantics: "js-sparse",
      baseType,
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

export function isCsharpJsRegExpTargetType(
  type: TargetTypeRef | undefined,
): type is CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "regexp";
} {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind === "regexp";
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
