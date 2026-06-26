import {
  csharpEnumerableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpVoidTargetType,
  targetParameter,
} from "../source-library.js";
import {
  collectionConstructor,
  collectionMethod,
  noParameterMapPolicies,
  sameParameterMapPolicies,
  setForEachMembers,
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
    {
      sourceName: "constructor",
      createMembers: (policy, setType, [elementType]) =>
        elementType === undefined
          ? []
          : [
              collectionConstructor(policy, "Tsonic.CSharp.Js.Set..ctor()", setType, []),
              collectionConstructor(policy, "Tsonic.CSharp.Js.Set..ctor(System.Collections.Generic.IEnumerable`1)", setType, [
                targetParameter("values", csharpEnumerableTargetType(elementType)),
              ]),
            ],
    },
    {
      sourceName: "add",
      createMembers: (policy, setType, [elementType]) =>
        elementType === undefined
          ? []
          : [collectionMethod(policy, "add", setType, [targetParameter("value", elementType)], setType)],
    },
    ...sameParameterMapPolicies(["has", "delete"], ([elementType]) =>
      elementType === undefined ? [] : [targetParameter("value", elementType)], () => csharpSourcePrimitiveTargetType("bool")),
    ...noParameterMapPolicies(["clear"], () => csharpVoidTargetType()),
    ...noParameterMapPolicies(["keys", "values"], ([elementType]) => elementType === undefined ? undefined : csharpEnumerableTargetType(elementType)),
    ...noParameterMapPolicies(["entries"], ([elementType]) =>
      elementType === undefined
        ? undefined
        : csharpEnumerableTargetType({ kind: "tuple", elements: [elementType, elementType] })),
    {
      sourceName: "forEach",
      createMembers: (policy, setType, [elementType]) =>
        elementType === undefined
          ? []
          : setForEachMembers(policy, setType, elementType),
    },
  ],
} satisfies CsharpJsCollectionTypePolicy;
