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
  csharpJsArrayCarrierTargetType,
} from "../../array-target-type.js";
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
    arrayHelperMethod("push", "push", [targetParameter("array", context.arrayType), targetParameter("item", context.itemType)], context.intType, context.arrayHelpersType, { idSuffix: "push:full-js" }),
    ...(receiverElementType === undefined ? [] : arrayNullishElementHelpers("pop", "pop", "popValue", "popReference", [targetParameter("array", context.listType)], context.itemType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayNullishElementHelpers("pop", "pop:full-js", "popValue", "popReference", [targetParameter("array", context.arrayType)], context.itemType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayNullishElementHelpers("shift", "shift", "shiftValue", "shiftReference", [targetParameter("array", context.listType)], context.itemType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayNullishElementHelpers("shift", "shift:full-js", "shiftValue", "shiftReference", [targetParameter("array", context.arrayType)], context.itemType, context.arrayHelpersType)),
    arrayHelperMethod("unshift", "unshift", [targetParameter("array", context.listType), targetParameter("item", context.itemType)], context.intType, context.arrayHelpersType, { idSuffix: "unshift" }),
    arrayHelperMethod("unshift", "unshift", [targetParameter("array", context.arrayType), targetParameter("item", context.itemType)], context.intType, context.arrayHelpersType, { idSuffix: "unshift:full-js" }),
    arrayHelperMethod("concat", "concat", [targetParameter("array", context.enumerableType), targetParameter("items", context.enumerableType, { paramsArray: true })], context.listType, context.arrayHelpersType, { idSuffix: "concat" }),
    arrayHelperMethod("concat", "concat", [targetParameter("array", context.arrayType), targetParameter("items", context.enumerableType, { paramsArray: true })], context.arrayType, context.arrayHelpersType, { idSuffix: "concat:full-js" }),
    ...(receiverElementType === undefined ? [] : arrayAtHelpers("at", "at:int32", context.readOnlyListType, context.itemType, context.intType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayAtHelpers("at", "at:float64", context.readOnlyListType, context.itemType, context.doubleType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayAtHelpers("at", "at:full-js:int32", context.arrayType, context.itemType, context.intType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayAtHelpers("at", "at:full-js:float64", context.arrayType, context.itemType, context.doubleType, context.arrayHelpersType)),
    arrayHelperMethod("includes", "includes", [targetParameter("array", context.readOnlyListType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.boolType, context.arrayHelpersType, { idSuffix: "includes" }),
    arrayHelperMethod("includes", "includes", [targetParameter("array", context.arrayType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.boolType, context.arrayHelpersType, { idSuffix: "includes:full-js" }),
    arrayHelperMethod("indexOf", "indexOf", [targetParameter("array", context.readOnlyListType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.intType, context.arrayHelpersType, { idSuffix: "indexOf" }),
    arrayHelperMethod("indexOf", "indexOf", [targetParameter("array", context.arrayType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.intType, context.arrayHelpersType, { idSuffix: "indexOf:full-js" }),
    arrayHelperMethod("lastIndexOf", "lastIndexOf", [targetParameter("array", context.readOnlyListType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.intType, context.arrayHelpersType, { idSuffix: "lastIndexOf" }),
    arrayHelperMethod("lastIndexOf", "lastIndexOf", [targetParameter("array", context.arrayType), targetParameter("searchElement", context.itemType), targetParameter("fromIndex", context.intType, { optional: true })], context.intType, context.arrayHelpersType, { idSuffix: "lastIndexOf:full-js" }),
    arrayHelperMethod("join", "join", [targetParameter("array", context.readOnlyListType), targetParameter("separator", context.stringType, { optional: true })], context.stringType, context.arrayHelpersType, { idSuffix: "join" }),
    arrayHelperMethod("join", "join", [targetParameter("array", context.arrayType), targetParameter("separator", context.stringType, { optional: true })], context.stringType, context.arrayHelpersType, { idSuffix: "join:full-js" }),
    arrayHelperMethod("slice", "slice", [targetParameter("array", context.readOnlyListType), targetParameter("start", context.intType, { optional: true }), targetParameter("end", context.intType, { optional: true })], context.listType, context.arrayHelpersType, { idSuffix: "slice" }),
    arrayHelperMethod("slice", "slice", [targetParameter("array", context.arrayType), targetParameter("start", context.intType, { optional: true }), targetParameter("end", context.intType, { optional: true })], context.arrayType, context.arrayHelpersType, { idSuffix: "slice:full-js" }),
    arrayHelperMethod("splice", "splice", [targetParameter("array", context.listType), targetParameter("start", context.intType), targetParameter("deleteCount", csharpNullableValueTargetType(context.intType), { optional: true }), targetParameter("items", context.itemType, { paramsArray: true })], context.listType, context.arrayHelpersType, { idSuffix: "splice" }),
    arrayHelperMethod("splice", "splice", [targetParameter("array", context.arrayType), targetParameter("start", context.intType), targetParameter("deleteCount", csharpNullableValueTargetType(context.intType), { optional: true }), targetParameter("items", context.itemType, { paramsArray: true })], context.arrayType, context.arrayHelpersType, { idSuffix: "splice:full-js" }),
    arrayHelperMethod("reverse", "reverse", [targetParameter("array", context.listType)], context.listType, context.arrayHelpersType, { idSuffix: "reverse" }),
    arrayHelperMethod("reverse", "reverse", [targetParameter("array", context.arrayType)], context.arrayType, context.arrayHelpersType, { idSuffix: "reverse:full-js" }),
    arrayHelperMethod("fill", "fill", [targetParameter("array", context.listType), targetParameter("value", context.itemType), targetParameter("start", context.intType, { optional: true }), targetParameter("end", context.intType, { optional: true })], context.listType, context.arrayHelpersType, { idSuffix: "fill" }),
    arrayHelperMethod("fill", "fill", [targetParameter("array", context.arrayType), targetParameter("value", context.itemType), targetParameter("start", context.intType, { optional: true }), targetParameter("end", context.intType, { optional: true })], context.arrayType, context.arrayHelpersType, { idSuffix: "fill:full-js" }),
    arrayHelperMethod("copyWithin", "copyWithin", [targetParameter("array", context.listType), targetParameter("target", context.intType), targetParameter("start", context.intType, { optional: true }), targetParameter("end", context.intType, { optional: true })], context.listType, context.arrayHelpersType, { idSuffix: "copyWithin" }),
    arrayHelperMethod("copyWithin", "copyWithin", [targetParameter("array", context.arrayType), targetParameter("target", context.intType), targetParameter("start", context.intType, { optional: true }), targetParameter("end", context.intType, { optional: true })], context.arrayType, context.arrayHelpersType, { idSuffix: "copyWithin:full-js" }),
    arrayHelperMethod("toReversed", "toReversed", [targetParameter("array", context.readOnlyListType)], context.listType, context.arrayHelpersType, { idSuffix: "toReversed" }),
    arrayHelperMethod("toReversed", "toReversed", [targetParameter("array", context.arrayType)], context.arrayType, context.arrayHelpersType, { idSuffix: "toReversed:full-js" }),
    arrayHelperMethod("toSorted", "toSorted", [targetParameter("array", context.readOnlyListType), targetParameter("compareFn", csharpDelegateTargetType("System.Func", [context.itemType, context.itemType], csharpSourcePrimitiveTargetType("float64")))], context.listType, context.arrayHelpersType, { idSuffix: "toSorted" }),
    arrayHelperMethod("toSorted", "toSorted", [targetParameter("array", context.arrayType), targetParameter("compareFn", csharpDelegateTargetType("System.Func", [context.itemType, context.itemType], csharpSourcePrimitiveTargetType("float64")))], context.arrayType, context.arrayHelpersType, { idSuffix: "toSorted:full-js" }),
    arrayHelperMethod("toSpliced", "toSpliced", [targetParameter("array", context.readOnlyListType), targetParameter("start", context.intType), targetParameter("deleteCount", csharpNullableValueTargetType(context.intType), { optional: true }), targetParameter("items", context.itemType, { paramsArray: true })], context.listType, context.arrayHelpersType, { idSuffix: "toSpliced" }),
    arrayHelperMethod("toSpliced", "toSpliced", [targetParameter("array", context.arrayType), targetParameter("start", context.intType), targetParameter("deleteCount", csharpNullableValueTargetType(context.intType), { optional: true }), targetParameter("items", context.itemType, { paramsArray: true })], context.arrayType, context.arrayHelpersType, { idSuffix: "toSpliced:full-js" }),
    arrayHelperMethod("with", "with", [targetParameter("array", context.readOnlyListType), targetParameter("index", context.intType), targetParameter("value", context.itemType)], context.listType, context.arrayHelpersType, { idSuffix: "with" }),
    arrayHelperMethod("with", "with", [targetParameter("array", context.arrayType), targetParameter("index", context.intType), targetParameter("value", context.itemType)], context.arrayType, context.arrayHelpersType, { idSuffix: "with:full-js" }),
    arrayHelperMethod("keys", "keys", [targetParameter("array", context.readOnlyListType)], context.keyEnumerableType, context.arrayHelpersType, { idSuffix: "keys" }),
    arrayHelperMethod("keys", "keys", [targetParameter("array", context.arrayType)], context.keyEnumerableType, context.arrayHelpersType, { idSuffix: "keys:full-js" }),
    arrayHelperMethod("values", "values", [targetParameter("array", context.readOnlyListType)], context.valueEnumerableType, context.arrayHelpersType, { idSuffix: "values" }),
    arrayHelperMethod("values", "values", [targetParameter("array", context.arrayType)], context.valueEnumerableType, context.arrayHelpersType, { idSuffix: "values:full-js" }),
    arrayHelperMethod("entries", "entries", [targetParameter("array", context.readOnlyListType)], context.entryEnumerableType, context.arrayHelpersType, { idSuffix: "entries" }),
    arrayHelperMethod("entries", "entries", [targetParameter("array", context.arrayType)], context.entryEnumerableType, context.arrayHelpersType, { idSuffix: "entries:full-js" }),
    ...arrayCallbackHelpers("sort", "sort", "System.Func", context.itemType, csharpSourcePrimitiveTargetType("float64"), context.listType, context.listType, context.arrayHelpersType, { idBase: "sort", compareCallback: true, mutable: true }),
    ...arrayCallbackHelpers("sort", "sort", "System.Func", context.itemType, csharpSourcePrimitiveTargetType("float64"), context.arrayType, context.arrayType, context.arrayHelpersType, { idBase: "sort:full-js", compareCallback: true, mutable: true }),
    ...arrayCallbackHelpers("forEach", "forEach", "System.Action", context.itemType, csharpVoidTargetType(), csharpVoidTargetType(), context.readOnlyListType, context.arrayHelpersType, { idBase: "forEach" }),
    ...arrayCallbackHelpers("forEach", "forEach", "System.Action", context.itemType, csharpVoidTargetType(), csharpVoidTargetType(), context.arrayType, context.arrayHelpersType, { idBase: "forEach:full-js" }),
    ...arrayCallbackHelpers("some", "some", "System.Func", context.itemType, context.boolType, context.boolType, context.readOnlyListType, context.arrayHelpersType, { idBase: "some" }),
    ...arrayCallbackHelpers("some", "some", "System.Func", context.itemType, context.boolType, context.boolType, context.arrayType, context.arrayHelpersType, { idBase: "some:full-js" }),
    ...arrayCallbackHelpers("every", "every", "System.Func", context.itemType, context.boolType, context.boolType, context.readOnlyListType, context.arrayHelpersType, { idBase: "every" }),
    ...arrayCallbackHelpers("every", "every", "System.Func", context.itemType, context.boolType, context.boolType, context.arrayType, context.arrayHelpersType, { idBase: "every:full-js" }),
    ...arrayCallbackHelpers("filter", "filter", "System.Func", context.itemType, context.boolType, context.listType, context.readOnlyListType, context.arrayHelpersType, { idBase: "filter" }),
    ...arrayCallbackHelpers("filter", "filter", "System.Func", context.itemType, context.boolType, context.arrayType, context.arrayType, context.arrayHelpersType, { idBase: "filter:full-js" }),
    ...arrayCallbackHelpers("map", "map", "System.Func", context.itemType, context.mappedItemType, csharpListTargetType(context.mappedItemType), context.readOnlyListType, context.arrayHelpersType, { idBase: "map", typeParameters: [{ name: "U" }] }),
    ...arrayCallbackHelpers("map", "map", "System.Func", context.itemType, context.mappedItemType, csharpJsArrayCarrierTargetType(context.mappedItemType), context.arrayType, context.arrayHelpersType, { idBase: "map:full-js", typeParameters: [{ name: "U" }] }),
    ...(receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers("find", "find", "findValue", "findReference", "System.Func", context.itemType, context.boolType, context.readOnlyListType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers("find", "find:full-js", "findValue", "findReference", "System.Func", context.itemType, context.boolType, context.arrayType, context.arrayHelpersType)),
    ...arrayCallbackHelpers("findIndex", "findIndex", "System.Func", context.itemType, context.boolType, context.intType, context.readOnlyListType, context.arrayHelpersType, { idBase: "findIndex" }),
    ...arrayCallbackHelpers("findIndex", "findIndex", "System.Func", context.itemType, context.boolType, context.intType, context.arrayType, context.arrayHelpersType, { idBase: "findIndex:full-js" }),
    ...(receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers("findLast", "findLast", "findLastValue", "findLastReference", "System.Func", context.itemType, context.boolType, context.readOnlyListType, context.arrayHelpersType)),
    ...(receiverElementType === undefined ? [] : arrayNullishElementCallbackHelpers("findLast", "findLast:full-js", "findLastValue", "findLastReference", "System.Func", context.itemType, context.boolType, context.arrayType, context.arrayHelpersType)),
    ...arrayCallbackHelpers("findLastIndex", "findLastIndex", "System.Func", context.itemType, context.boolType, context.intType, context.readOnlyListType, context.arrayHelpersType, { idBase: "findLastIndex" }),
    ...arrayCallbackHelpers("findLastIndex", "findLastIndex", "System.Func", context.itemType, context.boolType, context.intType, context.arrayType, context.arrayHelpersType, { idBase: "findLastIndex:full-js" }),
  ];
}
