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
  targetMethod,
  targetParameter,
} from "../source-library.js";

export function getArrayTargetMembers(sourceName: string, receiverElementType?: TargetTypeRef): readonly TargetMember[] {
  const itemType: TargetTypeRef = receiverElementType ?? { kind: "type-parameter", name: "T" };
  const mappedItemType: TargetTypeRef = { kind: "type-parameter", name: "U" };
  const enumerableType: TargetTypeRef = csharpEnumerableTargetType(itemType);
  const readOnlyListType: TargetTypeRef = csharpReadOnlyListTargetType(itemType);
  const listType: TargetTypeRef = csharpListTargetType(itemType);
  const intType = csharpSourcePrimitiveTargetType("int32");
  const boolType = csharpSourcePrimitiveTargetType("bool");
  const stringType = csharpStringTargetType();
  const arrayHelpersType = csharpTargetNamedType("Tsonic.CSharp.Js.Array", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Array"));
  switch (sourceName) {
    case "from":
      return [
        arrayStaticMethod(sourceName, "from", [targetParameter("iterable", enumerableType)], listType, arrayHelpersType, "from:array:native"),
        arrayStaticMethod(sourceName, "from", [targetParameter("source", stringType)], csharpListTargetType(stringType), arrayHelpersType, "from:string:native"),
        arrayStaticMethod(sourceName, "from", [
          targetParameter("iterable", enumerableType),
          targetParameter("mapFunc", csharpDelegateTargetType("System.Func", [itemType, intType], itemType)),
        ], listType, arrayHelpersType, "from:array:indexed-map:native"),
        arrayStaticMethod(sourceName, "from", [
          targetParameter("iterable", enumerableType),
          targetParameter("mapFunc", csharpDelegateTargetType("System.Func", [itemType], itemType)),
        ], listType, arrayHelpersType, "from:array:map:native"),
      ];
    case "of":
      return [arrayStaticMethod(sourceName, "of", [targetParameter("items", itemType, { paramsArray: true })], listType, arrayHelpersType, "of:native")];
    case "isArray":
      return [arrayStaticMethod(sourceName, "isArray", [targetParameter("value", readOnlyListType)], boolType, arrayHelpersType, "isArray:native")];
    case "push":
      return [arrayHelperMethod(sourceName, "push", [targetParameter("array", listType), targetParameter("item", itemType)], intType, arrayHelpersType)];
    case "pop":
      return receiverElementType === undefined ? [] : arrayNullishElementHelpers(sourceName, "popValue", "popReference", [targetParameter("array", listType)], itemType, arrayHelpersType);
    case "shift":
      return receiverElementType === undefined ? [] : arrayNullishElementHelpers(sourceName, "shiftValue", "shiftReference", [targetParameter("array", listType)], itemType, arrayHelpersType);
    case "unshift":
      return [arrayHelperMethod(sourceName, "unshift", [targetParameter("array", listType), targetParameter("item", itemType)], intType, arrayHelpersType)];
    case "concat":
      return [arrayHelperMethod(sourceName, "concat", [targetParameter("array", enumerableType), targetParameter("items", enumerableType, { paramsArray: true })], listType, arrayHelpersType)];
    case "at":
      return receiverElementType === undefined ? [] : arrayAtHelpers(sourceName, readOnlyListType, itemType, intType, arrayHelpersType);
    case "includes":
      return [arrayHelperMethod(sourceName, "includes", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], boolType, arrayHelpersType)];
    case "indexOf":
      return [arrayHelperMethod(sourceName, "indexOf", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], intType, arrayHelpersType)];
    case "lastIndexOf":
      return [arrayHelperMethod(sourceName, "lastIndexOf", [targetParameter("array", readOnlyListType), targetParameter("searchElement", itemType), targetParameter("fromIndex", intType, { optional: true })], intType, arrayHelpersType)];
    case "join":
      return [arrayHelperMethod(sourceName, "join", [targetParameter("array", readOnlyListType), targetParameter("separator", stringType, { optional: true })], stringType, arrayHelpersType)];
    case "slice":
      return [arrayHelperMethod(sourceName, "slice", [targetParameter("array", readOnlyListType), targetParameter("start", intType, { optional: true }), targetParameter("end", intType, { optional: true })], listType, arrayHelpersType)];
    case "splice":
      return [arrayHelperMethod(sourceName, "splice", [targetParameter("array", listType), targetParameter("start", intType), targetParameter("deleteCount", csharpNullableValueTargetType(intType), { optional: true }), targetParameter("items", itemType, { paramsArray: true })], listType, arrayHelpersType)];
    case "reverse":
      return [arrayHelperMethod(sourceName, "reverse", [targetParameter("array", listType)], listType, arrayHelpersType)];
    case "sort":
      return arrayCallbackHelpers(sourceName, "sort", "System.Func", itemType, csharpSourcePrimitiveTargetType("float64"), listType, listType, arrayHelpersType, { compareCallback: true, mutable: true });
    case "forEach":
      return arrayCallbackHelpers(sourceName, "forEach", "System.Action", itemType, csharpVoidTargetType(), csharpVoidTargetType(), readOnlyListType, arrayHelpersType);
    case "some":
      return arrayCallbackHelpers(sourceName, "some", "System.Func", itemType, boolType, boolType, readOnlyListType, arrayHelpersType);
    case "every":
      return arrayCallbackHelpers(sourceName, "every", "System.Func", itemType, boolType, boolType, readOnlyListType, arrayHelpersType);
    case "filter":
      return arrayCallbackHelpers(sourceName, "filter", "System.Func", itemType, boolType, listType, readOnlyListType, arrayHelpersType);
    case "map":
      return arrayCallbackHelpers(sourceName, "map", "System.Func", itemType, mappedItemType, csharpListTargetType(mappedItemType), readOnlyListType, arrayHelpersType, { typeParameters: [{ name: "U" }] });
    case "find":
      return receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers(sourceName, "findValue", "findReference", "System.Func", itemType, boolType, readOnlyListType, arrayHelpersType);
    case "findIndex":
      return arrayCallbackHelpers(sourceName, "findIndex", "System.Func", itemType, boolType, intType, readOnlyListType, arrayHelpersType);
    case "findLast":
      return receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers(sourceName, "findLastValue", "findLastReference", "System.Func", itemType, boolType, readOnlyListType, arrayHelpersType);
    case "findLastIndex":
      return arrayCallbackHelpers(sourceName, "findLastIndex", "System.Func", itemType, boolType, intType, readOnlyListType, arrayHelpersType);
    default:
      return [];
  }
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
): readonly TargetMember[] {
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
): readonly TargetMember[] {
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
): readonly TargetMember[] {
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
): readonly TargetMember[] {
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
): TargetMember {
  const owner = declaringType.kind === "target-named" ? declaringType.id.replace(/`.*$/, "") : "Tsonic.CSharp.Js.Array";
  return targetMethod(`${owner}.${idSuffix}`, sourceName, targetName, parameters, returnType, { declaringType, static: true });
}

function arrayHelperMethod(
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  declaringType: TargetTypeRef,
  options: { readonly idSuffix?: string; readonly typeParameters?: readonly TargetTypeParameter[] } = {},
): TargetMember {
  const member = targetMethod(`Tsonic.CSharp.Js.Array.${options.idSuffix ?? sourceName}`, sourceName, targetName, parameters, returnType, {
    declaringType,
    static: true,
    receiverPassing: "first-argument",
  });
  return options.typeParameters === undefined ? member : { ...member, typeParameters: options.typeParameters };
}
