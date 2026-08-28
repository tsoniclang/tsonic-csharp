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
  csharpJsStringTargetType,
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

export function csharpJsWeakMapTargetType(
  keyType: TargetTypeRef,
  valueType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.WeakMap`2",
      [keyType, valueType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "WeakMap"),
    ),
    csharpJsSurfaceKind: "weak-map",
  };
}

export function csharpJsWeakSetTargetType(
  elementType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.WeakSet`1",
      [elementType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "WeakSet"),
    ),
    csharpJsSurfaceKind: "weak-set",
  };
}

export function getCsharpJsWeakMapTargetTypes(
  type: TargetTypeRef | undefined,
): { readonly key: TargetTypeRef; readonly value: TargetTypeRef } | undefined {
  return type?.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind === "weak-map" &&
      type.typeArguments?.length === 2
    ? { key: type.typeArguments[0]!, value: type.typeArguments[1]! }
    : undefined;
}

export function getCsharpJsWeakSetElementTargetType(
  type: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return type?.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind === "weak-set" &&
      type.typeArguments?.length === 1
    ? type.typeArguments[0]
    : undefined;
}

export function csharpJsSymbolTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.Symbol",
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Symbol"),
    ),
    csharpJsSurfaceKind: "symbol",
  };
}

export function csharpJsPromiseFulfilledResultTargetType(
  valueType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  if (
    valueType.kind === "target-named" &&
    valueType.id === "System.Void"
  ) {
    return csharpTargetNamedType(
      "Tsonic.CSharp.Js.PromiseFulfilledResult",
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseFulfilledResult"),
    );
  }
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.PromiseFulfilledResult`1",
    [valueType],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseFulfilledResult"),
  );
}

export function csharpJsPromiseRejectedResultTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.PromiseRejectedResult",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRejectedResult"),
  );
}

export function csharpJsArrayBufferTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.ArrayBuffer",
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "ArrayBuffer"),
    ),
    csharpJsSurfaceKind: "array-buffer",
  };
}

export function csharpJsDataViewTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType(
      "Tsonic.CSharp.Js.DataView",
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "DataView"),
    ),
    csharpJsSurfaceKind: "data-view",
  };
}

export type CsharpJsIntlCarrierName =
  | "IntlDateTimeFormat"
  | "IntlNumberFormat"
  | "IntlCollator"
  | "IntlDateTimeFormatPart"
  | "IntlNumberFormatPart"
  | "IntlResolvedDateTimeFormatOptions"
  | "IntlResolvedNumberFormatOptions"
  | "IntlResolvedCollatorOptions";

export function csharpJsIntlTargetType(
  name: CsharpJsIntlCarrierName,
): CsharpTargetNamedTypeRef {
  const kind = name === "IntlDateTimeFormat"
    ? "intl-date-time-format"
    : name === "IntlNumberFormat"
      ? "intl-number-format"
      : name === "IntlCollator"
        ? "intl-collator"
        : undefined;
  return {
    ...csharpTargetNamedType(
      `Tsonic.CSharp.Js.${name}`,
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name),
    ),
    ...(kind === undefined ? {} : { csharpJsSurfaceKind: kind }),
  } as CsharpTargetNamedTypeRef;
}

const typedArrayNames = Object.freeze([
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
] as const);

export type CsharpJsTypedArrayName = typeof typedArrayNames[number];

export function csharpJsTypedArrayTargetType(
  name: CsharpJsTypedArrayName,
): CsharpTargetNamedTypeRef {
  const elementType = csharpSourcePrimitiveTargetType("float64");
  return {
    ...csharpTargetNamedType(
      `Tsonic.CSharp.Js.${name}`,
      undefined,
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name),
      {
        enumerableElementType: elementType,
        readOnlyIndexableElementType: elementType,
        denseMutableElementType: elementType,
        indexableLengthMemberName: "length",
        collectionSemantics: "dense",
      },
    ),
    csharpJsSurfaceKind: "typed-array",
  };
}

export function csharpJsTypedArrayElementTargetType(
  type: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (type?.kind !== "target-named" ||
      (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind !== "typed-array") {
    return undefined;
  }
  const name = type.id.slice("Tsonic.CSharp.Js.".length) as CsharpJsTypedArrayName;
  return typedArrayNames.includes(name)
    ? csharpSourcePrimitiveTargetType("float64")
    : undefined;
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

export function csharpExactJsRegExpExecArrayTargetType(): CsharpTargetNamedTypeRef {
  return csharpExactJsRegExpArrayTargetType(
    "Tsonic.CSharp.Js.JsRegExpExecArray",
    "RegExpExecArray",
    csharpExactJsRegExpMatchArrayTargetType(),
  );
}

export function csharpExactJsRegExpMatchArrayTargetType(): CsharpTargetNamedTypeRef {
  return csharpExactJsRegExpArrayTargetType(
    "Tsonic.CSharp.Js.JsRegExpMatchArray",
    "RegExpMatchArray",
  );
}

export function csharpExactJsRegExpIndicesArrayTargetType(): CsharpTargetNamedTypeRef {
  const pair: TargetTypeRef = {
    kind: "tuple",
    elements: [
      csharpSourcePrimitiveTargetType("float64"),
      csharpSourcePrimitiveTargetType("float64"),
    ],
  };
  return csharpJsArrayLikeTargetType(
    "Tsonic.CSharp.Js.JsRegExpIndicesArray",
    "RegExpIndicesArray",
    csharpNullableTargetType(pair),
  );
}

export function csharpExactJsRegExpNamedGroupsTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.JsRegExpNamedGroups",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpNamedGroups"),
  );
}

export function csharpExactJsRegExpNamedIndicesTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.JsRegExpNamedIndices",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpNamedIndices"),
  );
}

export function csharpExactJsRegExpStringIteratorTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.JsRegExpStringIterator",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpStringIterator"),
    { enumerableElementType: csharpExactJsRegExpExecArrayTargetType() },
  );
}

function csharpExactJsRegExpArrayTargetType(
  id: string,
  name: string,
  baseType?: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return csharpJsArrayLikeTargetType(
    id,
    name,
    csharpNullableTargetType(csharpJsStringTargetType()),
    baseType,
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
