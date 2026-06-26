import {
  collectionConstructorShape,
  collectionMemberShape,
  collectionMethodShape,
  declaringType,
  enumerableType,
  noParameterMapPolicies,
  mapForEachMemberShapes,
  nullableType,
  parameterShape,
  primitiveType,
  sameParameterMapPolicies,
  tupleType,
  typeArgument,
  voidType,
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
    collectionMemberShape("constructor", [
      collectionConstructorShape("Tsonic.CSharp.Js.Map..ctor()"),
      collectionConstructorShape("Tsonic.CSharp.Js.Map..ctor(System.Collections.Generic.IEnumerable`1)", [
        parameterShape("entries", enumerableType(tupleType(typeArgument(0), typeArgument(1)))),
      ]),
    ]),
    collectionMemberShape("get", [
      collectionMethodShape("get", [parameterShape("key", typeArgument(0))], nullableType(typeArgument(1))),
    ]),
    collectionMemberShape("set", [
      collectionMethodShape("set", [parameterShape("key", typeArgument(0)), parameterShape("value", typeArgument(1))], declaringType()),
    ]),
    ...sameParameterMapPolicies(["has", "delete"], [parameterShape("key", typeArgument(0))], primitiveType("bool")),
    ...noParameterMapPolicies(["clear"], voidType()),
    ...noParameterMapPolicies(["keys"], enumerableType(typeArgument(0))),
    ...noParameterMapPolicies(["values"], enumerableType(typeArgument(1))),
    ...noParameterMapPolicies(["entries"], enumerableType(tupleType(typeArgument(0), typeArgument(1)))),
    collectionMemberShape("forEach", mapForEachMemberShapes()),
  ],
} satisfies CsharpJsCollectionTypePolicy;
