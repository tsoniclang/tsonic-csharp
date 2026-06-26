import {
  csharpEnumerableTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpVoidTargetType,
  targetParameter,
} from "../source-library.js";
import {
  collectionConstructor,
  collectionMethod,
  mapForEachMembers,
  noParameterMapPolicies,
  sameParameterMapPolicies,
} from "./member-builders.js";
import {
  csharpJsMapTargetType,
  isCsharpJsMapTargetType,
} from "./target-types.js";
import type {
  CsharpJsCollectionTypePolicy,
} from "./types.js";

export const csharpJsMapCollectionPolicy = {
  sourceNames: ["Map", "ReadonlyMap"],
  targetName: "Map",
  typeParameterNames: ["K", "V"],
  createOpenType: () => csharpJsMapTargetType({ kind: "type-parameter", name: "K" }, { kind: "type-parameter", name: "V" }),
  createClosedType: (typeArguments) => {
    const [keyType, valueType] = typeArguments;
    return keyType === undefined || valueType === undefined || typeArguments.length !== 2
      ? undefined
      : csharpJsMapTargetType(keyType, valueType);
  },
  isTargetType: isCsharpJsMapTargetType,
  getIterableElementType: (typeArguments) => {
    const [keyType, valueType] = typeArguments;
    return keyType === undefined || valueType === undefined
      ? undefined
      : { kind: "tuple", elements: [keyType, valueType] };
  },
  members: [
    {
      sourceName: "constructor",
      createMembers: (policy, mapType, [keyType, valueType]) =>
        keyType === undefined || valueType === undefined
          ? []
          : [
              collectionConstructor(policy, "Tsonic.CSharp.Js.Map..ctor()", mapType, []),
              collectionConstructor(policy, "Tsonic.CSharp.Js.Map..ctor(System.Collections.Generic.IEnumerable`1)", mapType, [
                targetParameter("entries", csharpEnumerableTargetType({ kind: "tuple", elements: [keyType, valueType] })),
              ]),
            ],
    },
    {
      sourceName: "get",
      createMembers: (policy, mapType, [keyType, valueType]) =>
        keyType === undefined || valueType === undefined
          ? []
          : [collectionMethod(policy, "get", mapType, [targetParameter("key", keyType)], csharpNullableTargetType(valueType))],
    },
    {
      sourceName: "set",
      createMembers: (policy, mapType, [keyType, valueType]) =>
        keyType === undefined || valueType === undefined
          ? []
          : [collectionMethod(policy, "set", mapType, [targetParameter("key", keyType), targetParameter("value", valueType)], mapType)],
    },
    ...sameParameterMapPolicies(["has", "delete"], ([keyType]) =>
      keyType === undefined ? [] : [targetParameter("key", keyType)], () => csharpSourcePrimitiveTargetType("bool")),
    ...noParameterMapPolicies(["clear"], () => csharpVoidTargetType()),
    ...noParameterMapPolicies(["keys"], ([keyType]) => keyType === undefined ? undefined : csharpEnumerableTargetType(keyType)),
    ...noParameterMapPolicies(["values"], ([_keyType, valueType]) => valueType === undefined ? undefined : csharpEnumerableTargetType(valueType)),
    ...noParameterMapPolicies(["entries"], ([keyType, valueType]) =>
      keyType === undefined || valueType === undefined
        ? undefined
        : csharpEnumerableTargetType({ kind: "tuple", elements: [keyType, valueType] })),
    {
      sourceName: "forEach",
      createMembers: (policy, mapType, [keyType, valueType]) =>
        keyType === undefined || valueType === undefined
          ? []
          : mapForEachMembers(policy, mapType, keyType, valueType),
    },
  ],
} satisfies CsharpJsCollectionTypePolicy;
