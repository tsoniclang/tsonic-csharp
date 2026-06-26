import type {
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpListTargetType,
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpReadOnlyListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  isCsharpValueTypeTargetType,
  targetParameter,
} from "../source-library.js";
import {
  csharpJsArrayCarrierTargetType,
} from "../array-target-type.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../target-member-metadata.js";
import {
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
} from "../target-member-metadata.js";

export function arrayTargetMembersForSourceName(sourceName: string, receiverElementType?: TargetTypeRef): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceName(
    jsSurfaceTargetMemberMetadataIndex(arrayTargetMemberMetadata(receiverElementType)),
    sourceName,
  );
}

function arrayTargetMemberMetadata(receiverElementType?: TargetTypeRef): readonly JsSurfaceTargetMemberMetadata[] {
  const itemType: TargetTypeRef = receiverElementType ?? { kind: "type-parameter", name: "T" };
  const mappedItemType: TargetTypeRef = { kind: "type-parameter", name: "U" };
  const enumerableType: TargetTypeRef = csharpEnumerableTargetType(itemType);
  const readOnlyListType: TargetTypeRef = csharpReadOnlyListTargetType(itemType);
  const listType: TargetTypeRef = csharpListTargetType(itemType);
  const intType = csharpSourcePrimitiveTargetType("int32");
  const doubleType = csharpSourcePrimitiveTargetType("float64");
  const boolType = csharpSourcePrimitiveTargetType("bool");
  const stringType = csharpStringTargetType();
  const arrayHelpersType = csharpTargetNamedType("Tsonic.CSharp.Js.Array", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Array"));
  const arrayType = csharpJsArrayCarrierTargetType(itemType);
  return [
    arrayConstructor("Tsonic.CSharp.Js.JSArray..ctor()", arrayType, []),
    arrayConstructor("Tsonic.CSharp.Js.JSArray..ctor(System.Double)", arrayType, [targetParameter("length", doubleType)]),
    arrayStaticMethod("from", "from", [targetParameter("iterable", enumerableType)], listType, arrayHelpersType, "from:array:native"),
    arrayStaticMethod("from", "from", [targetParameter("source", stringType)], csharpListTargetType(stringType), arrayHelpersType, "from:string:native"),
    arrayStaticMethod("from", "from", [
      targetParameter("iterable", enumerableType),
      targetParameter("mapFunc", csharpDelegateTargetType("System.Func", [itemType, intType], itemType)),
    ], listType, arrayHelpersType, "from:array:indexed-map:native"),
    arrayStaticMethod("from", "from", [
      targetParameter("iterable", enumerableType),
      targetParameter("mapFunc", csharpDelegateTargetType("System.Func", [itemType], itemType)),
    ], listType, arrayHelpersType, "from:array:map:native"),
    arrayStaticMethod("of", "of", [targetParameter("items", itemType, { paramsArray: true })], listType, arrayHelpersType, "of:native"),
    arrayStaticMethod("isArray", "isArray", [targetParameter("value", readOnlyListType)], boolType, arrayHelpersType, "isArray:native"),
    arrayHelperMethod("push", "push", [targetParameter("array", listType), targetParameter("item", itemType)], intType, arrayHelpersType),
    ...(receiverElementType === undefined ? [] : arrayNullishElementHelpers("pop", "popValue", "popReference", [targetParameter("array", listType)], itemType, arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayNullishElementHelpers("shift", "shiftValue", "shiftReference", [targetParameter("array", listType)], itemType, arrayHelpersType)),
    arrayHelperMethod("unshift", "unshift", [targetParameter("array", listType), targetParameter("item", itemType)], intType, arrayHelpersType),
    arrayHelperMethod("concat", "concat", [targetParameter("array", enumerableType), targetParameter("items", enumerableType, { paramsArray: true })], listType, arrayHelpersType),
    ...(receiverElementType === undefined ? [] : arrayAtHelpers("at", readOnlyListType, itemType, intType, arrayHelpersType)),
    arrayHelperMethod("includes", "includes", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], boolType, arrayHelpersType),
    arrayHelperMethod("indexOf", "indexOf", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], intType, arrayHelpersType),
    arrayHelperMethod("lastIndexOf", "lastIndexOf", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], intType, arrayHelpersType),
    arrayHelperMethod("join", "join", [targetParameter("array", readOnlyListType), targetParameter("separator", stringType, { optional: true })], stringType, arrayHelpersType),
    arrayHelperMethod("slice", "slice", [targetParameter("array", readOnlyListType), targetParameter("start", intType, { optional: true }), targetParameter("end", intType, { optional: true })], listType, arrayHelpersType),
    arrayHelperMethod("splice", "splice", [targetParameter("array", listType), targetParameter("start", intType), targetParameter("deleteCount", csharpNullableValueTargetType(intType), { optional: true }), targetParameter("items", itemType, { paramsArray: true })], listType, arrayHelpersType),
    arrayHelperMethod("reverse", "reverse", [targetParameter("array", listType)], listType, arrayHelpersType),
    ...arrayCallbackHelpers("sort", "sort", "System.Func", itemType, csharpSourcePrimitiveTargetType("float64"), listType, listType, arrayHelpersType, { compareCallback: true, mutable: true }),
    ...arrayCallbackHelpers("forEach", "forEach", "System.Action", itemType, csharpVoidTargetType(), csharpVoidTargetType(), readOnlyListType, arrayHelpersType),
    ...arrayCallbackHelpers("some", "some", "System.Func", itemType, boolType, boolType, readOnlyListType, arrayHelpersType),
    ...arrayCallbackHelpers("every", "every", "System.Func", itemType, boolType, boolType, readOnlyListType, arrayHelpersType),
    ...arrayCallbackHelpers("filter", "filter", "System.Func", itemType, boolType, listType, readOnlyListType, arrayHelpersType),
    ...arrayCallbackHelpers("map", "map", "System.Func", itemType, mappedItemType, csharpListTargetType(mappedItemType), readOnlyListType, arrayHelpersType, { typeParameters: [{ name: "U" }] }),
    ...(receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers("find", "findValue", "findReference", "System.Func", itemType, boolType, readOnlyListType, arrayHelpersType)),
    ...arrayCallbackHelpers("findIndex", "findIndex", "System.Func", itemType, boolType, intType, readOnlyListType, arrayHelpersType),
    ...(receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers("findLast", "findLastValue", "findLastReference", "System.Func", itemType, boolType, readOnlyListType, arrayHelpersType)),
    ...arrayCallbackHelpers("findLastIndex", "findLastIndex", "System.Func", itemType, boolType, intType, readOnlyListType, arrayHelpersType),
  ];
}

function arrayCallbackHelpers(
  sourceName: string,
  targetName: string,
  delegateKind: "System.Action" | "System.Func",
  itemType: TargetTypeRef,
  callbackReturnType: TargetTypeRef,
  memberReturnType: TargetTypeRef,
  arrayType: TargetTypeRef,
  declaringType: TargetTypeRef,
  options: { readonly compareCallback?: boolean; readonly mutable?: boolean; readonly typeParameters?: readonly TargetTypeParameter[]; readonly idBase?: string } = {},
): readonly JsSurfaceTargetMemberMetadata[] {
  const intType = csharpSourcePrimitiveTargetType("int32");
  const callbackShapes: readonly TargetTypeRef[] = options.compareCallback === true
    ? [csharpDelegateTargetType("System.Func", [itemType, itemType], callbackReturnType)]
    : delegateKind === "System.Action"
    ? [
        csharpDelegateTargetType("System.Action", [itemType]),
        csharpDelegateTargetType("System.Action", [itemType, intType]),
        csharpDelegateTargetType("System.Action", [itemType, intType, arrayType]),
      ]
    : [
        csharpDelegateTargetType("System.Func", [itemType], callbackReturnType),
        csharpDelegateTargetType("System.Func", [itemType, intType], callbackReturnType),
        csharpDelegateTargetType("System.Func", [itemType, intType, arrayType], callbackReturnType),
      ];
  const idBase = options.idBase ?? sourceName;
  return callbackShapes.map((callback, index) => arrayHelperMethod(sourceName, targetName, [
    targetParameter("array", arrayType),
    targetParameter("callback", callback),
  ], memberReturnType, declaringType, { idSuffix: `${idBase}:${index + 1}`, typeParameters: options.typeParameters }));
}

function arrayNullishElementHelpers(
  sourceName: string,
  valueTargetName: string,
  referenceTargetName: string,
  parameters: readonly TargetParameter[],
  itemType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly JsSurfaceTargetMemberMetadata[] {
  const selection = getNullishElementHelperSelection(itemType, valueTargetName, referenceTargetName);
  return selection === undefined
    ? []
    : [arrayHelperMethod(sourceName, selection.targetName, parameters, csharpNullableTargetType(itemType), declaringType, { idSuffix: `${sourceName}:${selection.kind}` })];
}

function arrayNullishElementCallbackHelpers(
  sourceName: string,
  valueTargetName: string,
  referenceTargetName: string,
  delegateKind: "System.Func",
  itemType: TargetTypeRef,
  callbackReturnType: TargetTypeRef,
  arrayType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly JsSurfaceTargetMemberMetadata[] {
  const selection = getNullishElementHelperSelection(itemType, valueTargetName, referenceTargetName);
  return selection === undefined
    ? []
    : arrayCallbackHelpers(sourceName, selection.targetName, delegateKind, itemType, callbackReturnType, csharpNullableTargetType(itemType), arrayType, declaringType, { idBase: `${sourceName}:${selection.kind}` });
}

function getNullishElementHelperSelection(
  itemType: TargetTypeRef,
  valueTargetName: string,
  referenceTargetName: string,
): { readonly kind: "value"; readonly targetName: string } | { readonly kind: "reference"; readonly targetName: string } | undefined {
  if (isCsharpValueTypeTargetType(itemType)) {
    return { kind: "value", targetName: valueTargetName };
  }
  return itemType.kind === "type-parameter" ? undefined : { kind: "reference", targetName: referenceTargetName };
}

function arrayAtHelpers(
  sourceName: string,
  arrayType: TargetTypeRef,
  itemType: TargetTypeRef,
  intType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly JsSurfaceTargetMemberMetadata[] {
  if (isCsharpValueTypeTargetType(itemType)) {
    return [arrayHelperMethod(sourceName, "atValue", [targetParameter("array", arrayType), targetParameter("index", intType)], csharpNullableTargetType(itemType), declaringType, { idSuffix: `${sourceName}:value` })];
  }
  if (itemType.kind === "type-parameter") {
    return [];
  }
  return [arrayHelperMethod(sourceName, "atReference", [targetParameter("array", arrayType), targetParameter("index", intType)], csharpNullableTargetType(itemType), declaringType, { idSuffix: `${sourceName}:reference` })];
}

function arrayStaticMethod(
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  declaringType: TargetTypeRef,
  idSuffix = sourceName,
): JsSurfaceTargetMemberMetadata {
  const owner = declaringType.kind === "target-named" ? declaringType.id.replace(/`.*$/, "") : "Tsonic.CSharp.Js.Array";
  return {
    id: `${owner}.${idSuffix}`,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    declaringType,
    static: true,
  };
}

function arrayConstructor(
  id: string,
  declaringType: TargetTypeRef,
  parameters: readonly TargetParameter[],
): JsSurfaceTargetMemberMetadata {
  return {
    id,
    sourceName: "constructor",
    targetName: "JSArray",
    kind: "constructor",
    parameters,
    returnType: declaringType,
    declaringType,
  };
}

function arrayHelperMethod(
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  declaringType: TargetTypeRef,
  options: { readonly idSuffix?: string; readonly typeParameters?: readonly TargetTypeParameter[] } = {},
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Array.${options.idSuffix ?? sourceName}`,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    declaringType,
    static: true,
    receiverPassing: "first-argument",
    ...(options.typeParameters === undefined ? {} : { typeParameters: options.typeParameters }),
  };
}
