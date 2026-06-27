import type {
  CsharpJsCollectionTypePolicy,
} from "./types.js";

const elementType = { kind: "type-argument", index: 0 } as const;
const declaringType = { kind: "declaring" } as const;
const boolType = { kind: "primitive", name: "bool" } as const;
const voidType = { kind: "void" } as const;
const elementEnumerableType = { kind: "enumerable", element: elementType } as const;
const entryType = { kind: "tuple", elements: [elementType, elementType] } as const;
const entriesEnumerableType = { kind: "enumerable", element: entryType } as const;

export const csharpJsSetCollectionPolicy = {
  sourceNames: ["Set", "ReadonlySet"],
  target: {
    surfaceKind: "set",
    id: "Tsonic.CSharp.Js.Set`1",
    name: "Set",
    namespaceName: "Tsonic.CSharp.Js",
    enumerableElementType: elementType,
  },
  typeParameterNames: ["T"],
  members: [
    {
      sourceName: "constructor",
      members: [
        {
          id: "Tsonic.CSharp.Js.Set..ctor()",
          targetName: "constructor",
          kind: "constructor",
          parameters: [],
          returnType: declaringType,
        },
        {
          id: "Tsonic.CSharp.Js.Set..ctor(System.Collections.Generic.IEnumerable`1)",
          targetName: "constructor",
          kind: "constructor",
          parameters: [{ name: "values", type: elementEnumerableType }],
          returnType: declaringType,
        },
      ],
    },
    {
      sourceName: "add",
      members: [{
        id: "Tsonic.CSharp.Js.Set.add",
        targetName: "add",
        kind: "method",
        parameters: [{ name: "value", type: elementType }],
        returnType: declaringType,
      }],
    },
    {
      sourceName: "has",
      members: [{
        id: "Tsonic.CSharp.Js.Set.has",
        targetName: "has",
        kind: "method",
        parameters: [{ name: "value", type: elementType }],
        returnType: boolType,
      }],
    },
    {
      sourceName: "delete",
      members: [{
        id: "Tsonic.CSharp.Js.Set.delete",
        targetName: "delete",
        kind: "method",
        parameters: [{ name: "value", type: elementType }],
        returnType: boolType,
      }],
    },
    {
      sourceName: "clear",
      members: [{
        id: "Tsonic.CSharp.Js.Set.clear",
        targetName: "clear",
        kind: "method",
        parameters: [],
        returnType: voidType,
      }],
    },
    {
      sourceName: "keys",
      members: [{
        id: "Tsonic.CSharp.Js.Set.keys",
        targetName: "keys",
        kind: "method",
        parameters: [],
        returnType: elementEnumerableType,
      }],
    },
    {
      sourceName: "values",
      members: [{
        id: "Tsonic.CSharp.Js.Set.values",
        targetName: "values",
        kind: "method",
        parameters: [],
        returnType: elementEnumerableType,
      }],
    },
    {
      sourceName: "entries",
      members: [{
        id: "Tsonic.CSharp.Js.Set.entries",
        targetName: "entries",
        kind: "method",
        parameters: [],
        returnType: entriesEnumerableType,
      }],
    },
    {
      sourceName: "forEach",
      members: [
        {
          id: "Tsonic.CSharp.Js.Set.forEach(System.Action`1)",
          targetName: "forEach",
          kind: "method",
          parameters: [{ name: "callback", type: { kind: "delegate", id: "System.Action", typeArguments: [elementType] } }],
          returnType: voidType,
        },
        {
          id: "Tsonic.CSharp.Js.Set.forEach(System.Action`2)",
          targetName: "forEach",
          kind: "method",
          parameters: [{ name: "callback", type: { kind: "delegate", id: "System.Action", typeArguments: [elementType, elementType] } }],
          returnType: voidType,
        },
        {
          id: "Tsonic.CSharp.Js.Set.forEach(System.Action`3)",
          targetName: "forEach",
          kind: "method",
          parameters: [{ name: "callback", type: { kind: "delegate", id: "System.Action", typeArguments: [elementType, elementType, declaringType] } }],
          returnType: voidType,
        },
      ],
    },
  ],
} satisfies CsharpJsCollectionTypePolicy;
