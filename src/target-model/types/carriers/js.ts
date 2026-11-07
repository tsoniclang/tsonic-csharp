import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../model.js";
import { csharpQualifiedTypeRenderShape } from "../render-shapes.js";
import { csharpProjectedType } from "../projections.js";
import { csharpFreeTypeParameterIdentities } from "../generic-references.js";
import { csharpTargetNamedType } from "../factories.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "./nullable.js";
import { isCsharpValueTypeTargetType } from "../identity.js";
import { csharpSourcePrimitiveTargetType, csharpJsStringTargetType, csharpStringTargetType } from "./scalar-types.js";
import { csharpSourceSumStorageSlot, getCsharpRuntimeUnionArms } from "./runtime-carriers.js";

export const csharpJsArrayCarrierId = "Tsonic.CSharp.Js.JSArray`1";

export function csharpJsArrayTargetType(
  elementType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  const type = csharpTargetNamedType(csharpJsArrayCarrierId, [elementType], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSArray"), { allowsRefLikeTypeArguments: [false],
      arrayLikeElementType: elementType,
      arrayLiteralElementType: elementType,
      enumerableElementType: elementType,
      readOnlyIndexableElementType: elementType,
      denseMutableElementType: elementType,
      indexableLengthMemberName: "length",
      collectionSemantics: "js-array",
      typeofRuntimeKind: "object",
    });
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
  keyCategories: CsharpJsKeyCategories,
): CsharpTargetNamedTypeRef {
  const entryType: TargetTypeRef = {
    kind: "tuple",
    elements: [keyType, valueType],
  };
  return {
    ...csharpTargetNamedType("Tsonic.CSharp.Js.Map`3", [keyType, valueType, csharpJsCollectionKeyTargetType(keyType, keyCategories)], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Map"), { allowsRefLikeTypeArguments: [false, false, false], enumerableElementType: entryType, typeofRuntimeKind: "object" }),
    csharpJsSurfaceKind: "map",
  };
}

export function csharpJsSetTargetType(
  elementType: TargetTypeRef,
  keyCategories: CsharpJsKeyCategories,
): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType("Tsonic.CSharp.Js.Set`2", [elementType, csharpJsCollectionKeyTargetType(elementType, keyCategories)], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Set"), { allowsRefLikeTypeArguments: [false, false], enumerableElementType: elementType, typeofRuntimeKind: "object" }),
    csharpJsSurfaceKind: "set",
  };
}

/**
 * Q77: the Source key category of each PRESENT arm of a Set element or Map key, in authored Host arm order, as the Host
 * publishes it for the collection (SourceJsCollectionFacts, X5; the N3' rule, the typeof category of the arm's origin).
 * undefined only for a key that is not a union. "function" keys compare as objects.
 */
export type CsharpJsKeyCategory = "number" | "bigint" | "string" | "boolean" | "symbol" | "object" | "function";
export type CsharpJsKeyCategories = readonly CsharpJsKeyCategory[] | undefined;

const keyCategoryStructs: Readonly<Record<CsharpJsKeyCategory, string>> = Object.freeze({
  number: "NumberKeyCategory", bigint: "BigIntKeyCategory", string: "StringKeyCategory", boolean: "BooleanKeyCategory",
  symbol: "SymbolKeyCategory", object: "ObjectKeyCategory", function: "ObjectKeyCategory",
});

function csharpJsKeyCategoryTargetType(category: CsharpJsKeyCategory): TargetTypeRef {
  const name = keyCategoryStructs[category];
  return csharpTargetNamedType(`Tsonic.CSharp.Js.${name}`, undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name),
    { allowsRefLikeTypeArguments: [], valueType: true });
}

/**
 * The Host key categories already carried by a sealed union collection key (its category arguments, one per storage
 * arm), for matching an inferred projection against that actual key. undefined for a key that is not a union key.
 */
/**
 * Q86: the Host key categories a union carrier carries (one per present Host arm, csharpSourceSumKeyCategories, set by
 * the representation from facts.profile.keyCategories of the sum's descriptor). Read where a collection key is formed
 * from a substituted binder and no descriptor is at hand. undefined for a carrier that is not such a union.
 */
export function csharpSourceSumKeyCategoriesOf(value: TargetTypeRef): CsharpJsKeyCategories {
  const present = getCsharpNullableElementTargetType(value) ?? value;
  const categories = (present as { readonly csharpSourceSumKeyCategories?: readonly string[] }).csharpSourceSumKeyCategories;
  return categories as readonly CsharpJsKeyCategory[] | undefined;
}

export function csharpJsKeyCategoriesOf(key: TargetTypeRef): CsharpJsKeyCategories {
  const union = key.kind === "target-named" && key.id === "Tsonic.CSharp.Js.OptionalCollectionKey`2" ? key.typeArguments?.[1] : key;
  if (union?.kind !== "target-named" || !union.id.startsWith("Tsonic.CSharp.Js.UnionCollectionKey`")) return undefined;
  const byStruct = new Map(Object.entries(keyCategoryStructs).map(([category, name]) => [`Tsonic.CSharp.Js.${name}`, category]));
  return (union.typeArguments ?? []).flatMap((argument, index) => index % 2 === 1 && argument.kind === "target-named"
    ? [byStruct.get(argument.id) as CsharpJsKeyCategory] : []);
}

/**
 * The collection-key contract of a key carrier. A union key is `UnionCollectionKey<T1, C1, …, Tn, Cn>` over its storage
 * arms, each paired with its Source category (Q77). The categories are the Host's, per present Host arm; a storage arm
 * shared by coincident arms (Q73) takes the category of its FIRST Host arm in authored order (Q82). C# decides no
 * category. A union key without its Host categories is an invariant failure.
 */
export function csharpJsCollectionKeyTargetType(value: TargetTypeRef, keyCategories: CsharpJsKeyCategories): TargetTypeRef {
  if (csharpFreeTypeParameterIdentities([value]).size !== 0) {
    return csharpProjectedType({ kind: "collection-key", arguments: [value] });
  }
  const present = getCsharpNullableElementTargetType(value);
  if (present !== undefined && isCsharpValueTypeTargetType(present)) {
    return csharpTargetNamedType("Tsonic.CSharp.Js.OptionalCollectionKey`2", [present, csharpJsCollectionKeyTargetType(present, keyCategories)],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "OptionalCollectionKey"),
      { allowsRefLikeTypeArguments: [false, false], valueType: true });
  }
  const arms = getCsharpRuntimeUnionArms(value);
  if (arms === undefined) {
    return csharpTargetNamedType("Tsonic.CSharp.Js.CollectionKey`1", [value], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "CollectionKey"),
      { allowsRefLikeTypeArguments: [false], valueType: true });
  }
  if (keyCategories === undefined) throw new TypeError(
    "A union collection key requires the Host key category of every present arm (Q77, SourceJsCollectionFacts).");
  const categories = arms.map((_, slot) => {
    // Present Host arm i lands in storage slot csharpSourceSumStorageSlot(value, i); the first such arm decides (Q82).
    const first = keyCategories.findIndex((_, index) => (csharpSourceSumStorageSlot(value, index) ?? index) === slot);
    const category = first < 0 ? undefined : keyCategories[first];
    if (category === undefined) throw new TypeError("Every storage arm of a union collection key needs the category of a Host arm.");
    return csharpJsKeyCategoryTargetType(category);
  });
  const arguments_ = arms.flatMap((arm, index) => [arm, categories[index]!]);
  return csharpTargetNamedType(`Tsonic.CSharp.Js.UnionCollectionKey\`${arguments_.length}`, arguments_,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "UnionCollectionKey"),
    { allowsRefLikeTypeArguments: arguments_.map(() => false), valueType: true });
}

export function csharpJsWeakMapTargetType(
  keyType: TargetTypeRef,
  valueType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType("Tsonic.CSharp.Js.WeakMap`2", [keyType, valueType], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "WeakMap"), { allowsRefLikeTypeArguments: [false, false], typeofRuntimeKind: "object" }),
    csharpJsSurfaceKind: "weak-map",
  };
}

export function csharpJsWeakSetTargetType(
  elementType: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType("Tsonic.CSharp.Js.WeakSet`1", [elementType], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "WeakSet"), { allowsRefLikeTypeArguments: [false], typeofRuntimeKind: "object" }),
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
    ...csharpTargetNamedType("Tsonic.CSharp.Js.Symbol", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Symbol"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "symbol" }),
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
    return csharpTargetNamedType("Tsonic.CSharp.Js.PromiseFulfilledResult", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseFulfilledResult"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" });
  }
  return csharpTargetNamedType("Tsonic.CSharp.Js.PromiseFulfilledResult`1", [valueType], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseFulfilledResult"), { allowsRefLikeTypeArguments: [false], typeofRuntimeKind: "object" });
}

export function csharpJsPromiseRejectedResultTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.PromiseRejectedResult", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRejectedResult"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" });
}

export function csharpJsArrayBufferTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType("Tsonic.CSharp.Js.ArrayBuffer", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "ArrayBuffer"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" }),
    csharpJsSurfaceKind: "array-buffer",
  };
}

export function csharpJsDataViewTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType("Tsonic.CSharp.Js.DataView", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "DataView"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" }),
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
    ...csharpTargetNamedType(`Tsonic.CSharp.Js.${name}`, undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" }),
    ...(kind === undefined ? {} : { csharpJsSurfaceKind: kind }),
  } as CsharpTargetNamedTypeRef;
}

export const typedArrayNames = Object.freeze([
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

const typedArrayElementNames = {
  Int8Array: "int8",
  Uint8Array: "uint8",
  Uint8ClampedArray: "uint8",
  Int16Array: "int16",
  Uint16Array: "uint16",
  Int32Array: "int32",
  Uint32Array: "uint32",
  Float32Array: "float32",
  Float64Array: "float64",
} as const;

export function csharpJsTypedArrayTargetType(
  name: CsharpJsTypedArrayName,
): CsharpTargetNamedTypeRef {
  const elementType = csharpSourcePrimitiveTargetType(typedArrayElementNames[name]);
  return {
    ...csharpTargetNamedType(`Tsonic.CSharp.Js.${name}`, undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name), { allowsRefLikeTypeArguments: [],
        arrayLikeElementType: elementType,
        enumerableElementType: elementType,
        denseMutableElementType: elementType,
        indexableLengthMemberName: "length",
        collectionSemantics: "dense",
        typeofRuntimeKind: "object",
      }),
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
  const name = typedArrayNames.find(name => type.id === `Tsonic.CSharp.Js.${name}`);
  return name === undefined ? undefined : csharpSourcePrimitiveTargetType(typedArrayElementNames[name]);
}

export function getCsharpJsMapTargetTypes(
  type: TargetTypeRef | undefined,
): {
  readonly key: TargetTypeRef;
  readonly value: TargetTypeRef;
  readonly keyContract: TargetTypeRef;
} | undefined {
  if (
    type?.kind !== "target-named" ||
    (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind !== "map" ||
    type.typeArguments?.length !== 3
  ) {
    return undefined;
  }
  return {
    key: type.typeArguments[0]!,
    value: type.typeArguments[1]!,
    keyContract: type.typeArguments[2]!,
  };
}

export function getCsharpJsSetElementTargetType(
  type: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return type?.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpJsSurfaceKind === "set" &&
      type.typeArguments?.length === 2
    ? type.typeArguments[0]
    : undefined;
}

export function csharpJsDateTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType("Tsonic.CSharp.Js.Date", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Date"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" }),
    csharpJsSurfaceKind: "date",
  };
}

export function csharpJsRegExpTargetType(): CsharpTargetNamedTypeRef {
  return {
    ...csharpTargetNamedType("Tsonic.CSharp.Js.RegExp", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExp"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" }),
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

export function csharpRegExpIndexPairTargetType(): TargetTypeRef {
  return {
    kind: "tuple",
    elements: [
      csharpSourcePrimitiveTargetType("int32"),
      csharpSourcePrimitiveTargetType("int32"),
    ],
  };
}

export function csharpJsRegExpIndicesArrayTargetType(): CsharpTargetNamedTypeRef {
  return csharpJsArrayLikeTargetType(
    "Tsonic.CSharp.Js.RegExpIndicesArray",
    "RegExpIndicesArray",
    csharpNullableTargetType(csharpRegExpIndexPairTargetType()),
  );
}

export function csharpJsRegExpNamedGroupsTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.RegExpNamedGroups", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpNamedGroups"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" });
}

export function csharpJsRegExpNamedIndicesTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.RegExpNamedIndices", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpNamedIndices"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" });
}

export function csharpJsRegExpStringIteratorTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.RegExpStringIterator", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpStringIterator"), { allowsRefLikeTypeArguments: [], enumerableElementType: csharpJsRegExpExecArrayTargetType(), typeofRuntimeKind: "object" });
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
  return csharpJsArrayLikeTargetType(
    "Tsonic.CSharp.Js.JsRegExpIndicesArray",
    "RegExpIndicesArray",
    csharpNullableTargetType(csharpRegExpIndexPairTargetType()),
  );
}

export function csharpExactJsRegExpNamedGroupsTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.JsRegExpNamedGroups", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpNamedGroups"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" });
}

export function csharpExactJsRegExpNamedIndicesTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.JsRegExpNamedIndices", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpNamedIndices"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" });
}

export function csharpExactJsRegExpStringIteratorTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.JsRegExpStringIterator", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpStringIterator"), { allowsRefLikeTypeArguments: [], enumerableElementType: csharpExactJsRegExpExecArrayTargetType(), typeofRuntimeKind: "object" });
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
  const type = csharpTargetNamedType(id, undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name), { allowsRefLikeTypeArguments: [],
      enumerableElementType: elementType,
      readOnlyIndexableElementType: elementType,
      denseMutableElementType: elementType,
      indexableLengthMemberName: "length",
      collectionSemantics: "js-array",
      baseType,
      typeofRuntimeKind: "object",
    });
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
        "js-array"
    ? (type as CsharpTargetNamedTypeRef).csharpJsArrayMutation
    : undefined;
}
