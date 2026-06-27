import {
  csharpDelegateTargetType,
  csharpListTargetType,
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpVoidTargetType,
  targetParameter,
} from "../../source-library.js";
import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../../target-member-metadata.js";
import {
  arrayConstructor,
  arrayHelperMethod,
  arrayStaticMethod,
} from "./builders.js";
import {
  arrayCallbackHelpers,
} from "./callback-members.js";
import {
  createArrayTargetMemberContext,
} from "./context.js";
import {
  arrayAtHelpers,
  arrayNullishElementCallbackHelpers,
  arrayNullishElementHelpers,
} from "./nullish-members.js";

export function arrayTargetMemberMetadata(receiverElementType?: TargetTypeRef): readonly JsSurfaceTargetMemberMetadata[] {
  const context = createArrayTargetMemberContext(receiverElementType);
  return [
    arrayConstructor("Tsonic.CSharp.Js.JSArray..ctor()", context.arrayType, []),
    arrayConstructor("Tsonic.CSharp.Js.JSArray..ctor(System.Double)", context.arrayType, [targetParameter("length", context.doubleType)]),
    arrayStaticMethod("from", "from", [targetParameter("iterable", context.enumerableType)], context.listType, context.arrayHelpersType, "from:array:native"),
    arrayStaticMethod("from", "from", [targetParameter("source", context.stringType)], csharpListTargetType(context.stringType), context.arrayHelpersType, "from:string:native"),
    arrayStaticMethod("from", "from", [
      targetParameter("iterable", context.enumerableType),
      targetParameter("mapFunc", csharpDelegateTargetType("System.Func", [context.itemType, context.intType], context.itemType)),
    ], context.listType, context.arrayHelpersType, "from:array:indexed-map:native"),
    arrayStaticMethod("from", "from", [
      targetParameter("iterable", context.enumerableType),
      targetParameter("mapFunc", csharpDelegateTargetType("System.Func", [context.itemType], context.itemType)),
    ], context.listType, context.arrayHelpersType, "from:array:map:native"),
    arrayStaticMethod("of", "of", [targetParameter("items", context.itemType, { paramsArray: true })], context.listType, context.arrayHelpersType, "of:native"),
    arrayStaticMethod("isArray", "isArray", [targetParameter("value", context.readOnlyListType)], context.boolType, context.arrayHelpersType, "isArray:native"),
    arrayHelperMethod("push", "push", [targetParameter("array", context.listType), targetParameter("item", context.itemType)], context.intType, context.arrayHelpersType, { idSuffix: "push" }),
    ...(receiverElementType === undefined ? [] : arrayNullishElementHelpers("pop", "pop", "popValue", "popReference", [targetParameter("array", context.listType)], context.itemType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayNullishElementHelpers("shift", "shift", "shiftValue", "shiftReference", [targetParameter("array", context.listType)], context.itemType, context.arrayHelpersType)),
    arrayHelperMethod("unshift", "unshift", [targetParameter("array", context.listType), targetParameter("item", context.itemType)], context.intType, context.arrayHelpersType, { idSuffix: "unshift" }),
    arrayHelperMethod("concat", "concat", [targetParameter("array", context.enumerableType), targetParameter("items", context.enumerableType, { paramsArray: true })], context.listType, context.arrayHelpersType, { idSuffix: "concat" }),
    ...(receiverElementType === undefined ? [] : arrayAtHelpers("at", "at", context.readOnlyListType, context.itemType, context.intType, context.arrayHelpersType)),
    arrayHelperMethod("includes", "includes", [targetParameter("array", context.readOnlyListType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.boolType, context.arrayHelpersType, { idSuffix: "includes" }),
    arrayHelperMethod("indexOf", "indexOf", [targetParameter("array", context.readOnlyListType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.intType, context.arrayHelpersType, { idSuffix: "indexOf" }),
    arrayHelperMethod("lastIndexOf", "lastIndexOf", [targetParameter("array", context.readOnlyListType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.intType, context.arrayHelpersType, { idSuffix: "lastIndexOf" }),
    arrayHelperMethod("join", "join", [targetParameter("array", context.readOnlyListType), targetParameter("separator", context.stringType, { optional: true })], context.stringType, context.arrayHelpersType, { idSuffix: "join" }),
    arrayHelperMethod("slice", "slice", [targetParameter("array", context.readOnlyListType), targetParameter("start", context.intType, { optional: true }), targetParameter("end", context.intType, { optional: true })], context.listType, context.arrayHelpersType, { idSuffix: "slice" }),
    arrayHelperMethod("splice", "splice", [targetParameter("array", context.listType), targetParameter("start", context.intType), targetParameter("deleteCount", csharpNullableValueTargetType(context.intType), { optional: true }), targetParameter("items", context.itemType, { paramsArray: true })], context.listType, context.arrayHelpersType, { idSuffix: "splice" }),
    arrayHelperMethod("reverse", "reverse", [targetParameter("array", context.listType)], context.listType, context.arrayHelpersType, { idSuffix: "reverse" }),
    ...arrayCallbackHelpers("sort", "sort", "System.Func", context.itemType, csharpSourcePrimitiveTargetType("float64"), context.listType, context.listType, context.arrayHelpersType, { idBase: "sort", compareCallback: true, mutable: true }),
    ...arrayCallbackHelpers("forEach", "forEach", "System.Action", context.itemType, csharpVoidTargetType(), csharpVoidTargetType(), context.readOnlyListType, context.arrayHelpersType, { idBase: "forEach" }),
    ...arrayCallbackHelpers("some", "some", "System.Func", context.itemType, context.boolType, context.boolType, context.readOnlyListType, context.arrayHelpersType, { idBase: "some" }),
    ...arrayCallbackHelpers("every", "every", "System.Func", context.itemType, context.boolType, context.boolType, context.readOnlyListType, context.arrayHelpersType, { idBase: "every" }),
    ...arrayCallbackHelpers("filter", "filter", "System.Func", context.itemType, context.boolType, context.listType, context.readOnlyListType, context.arrayHelpersType, { idBase: "filter" }),
    ...arrayCallbackHelpers("map", "map", "System.Func", context.itemType, context.mappedItemType, csharpListTargetType(context.mappedItemType), context.readOnlyListType, context.arrayHelpersType, { idBase: "map", typeParameters: [{ name: "U" }] }),
    ...(receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers("find", "find", "findValue", "findReference", "System.Func", context.itemType, context.boolType, context.readOnlyListType, context.arrayHelpersType)),
    ...arrayCallbackHelpers("findIndex", "findIndex", "System.Func", context.itemType, context.boolType, context.intType, context.readOnlyListType, context.arrayHelpersType, { idBase: "findIndex" }),
    ...(receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers("findLast", "findLast", "findLastValue", "findLastReference", "System.Func", context.itemType, context.boolType, context.readOnlyListType, context.arrayHelpersType)),
    ...arrayCallbackHelpers("findLastIndex", "findLastIndex", "System.Func", context.itemType, context.boolType, context.intType, context.readOnlyListType, context.arrayHelpersType, { idBase: "findLastIndex" }),
  ];
}
