import {
  collectionConstructorShape,
  collectionMemberShape,
  collectionMethodShape,
  declaringType,
  enumerableType,
  noParameterMapPolicies,
  parameterShape,
  primitiveType,
  sameParameterMapPolicies,
  setForEachMemberShapes,
  tupleType,
  typeArgument,
  voidType,
} from "./member-builders.js";
import {
  csharpJsSetTargetType,
  isCsharpJsSetTargetType,
} from "./target-types.js";
import type {
  CsharpJsCollectionTypePolicy,
} from "./types.js";

export const csharpJsSetCollectionPolicy = {
  sourceNames: ["Set", "ReadonlySet"],
  targetName: "Set",
  typeParameterNames: ["T"],
  createOpenType: () => csharpJsSetTargetType({ kind: "type-parameter", name: "T" }),
  createClosedType: (typeArguments) => {
    const [elementType] = typeArguments;
    return elementType === undefined || typeArguments.length !== 1
      ? undefined
      : csharpJsSetTargetType(elementType);
  },
  isTargetType: isCsharpJsSetTargetType,
  getIterableElementType: (typeArguments) => typeArguments[0],
  members: [
    collectionMemberShape("constructor", [
      collectionConstructorShape("Tsonic.CSharp.Js.Set..ctor()"),
      collectionConstructorShape("Tsonic.CSharp.Js.Set..ctor(System.Collections.Generic.IEnumerable`1)", [
        parameterShape("values", enumerableType(typeArgument(0))),
      ]),
    ]),
    collectionMemberShape("add", [
      collectionMethodShape("add", [parameterShape("value", typeArgument(0))], declaringType()),
    ]),
    ...sameParameterMapPolicies(["has", "delete"], [parameterShape("value", typeArgument(0))], primitiveType("bool")),
    ...noParameterMapPolicies(["clear"], voidType()),
    ...noParameterMapPolicies(["keys", "values"], enumerableType(typeArgument(0))),
    ...noParameterMapPolicies(["entries"], enumerableType(tupleType(typeArgument(0), typeArgument(0)))),
    collectionMemberShape("forEach", setForEachMemberShapes()),
  ],
} satisfies CsharpJsCollectionTypePolicy;
