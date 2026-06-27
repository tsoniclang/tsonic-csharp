import type {
  CsharpJsCollectionTypePolicy,
} from "./types.js";

const keyType = { kind: "type-argument", index: 0 } as const;
const valueType = { kind: "type-argument", index: 1 } as const;
const declaringType = { kind: "declaring" } as const;
const boolType = { kind: "primitive", name: "bool" } as const;
const voidType = { kind: "void" } as const;
const entryType = { kind: "tuple", elements: [keyType, valueType] } as const;
const entriesEnumerableType = { kind: "enumerable", element: entryType } as const;
const keyEnumerableType = { kind: "enumerable", element: keyType } as const;
const valueEnumerableType = { kind: "enumerable", element: valueType } as const;

export const csharpJsMapCollectionPolicy = {
  sourceNames: ["Map", "ReadonlyMap"],
  target: {
    surfaceKind: "map",
    id: "Tsonic.CSharp.Js.Map`2",
    name: "Map",
    namespaceName: "Tsonic.CSharp.Js",
    enumerableElementType: entryType,
  },
  typeParameterNames: ["K", "V"],
  members: [
    {
      sourceName: "constructor",
      members: [
        {
          id: "Tsonic.CSharp.Js.Map..ctor()",
          targetName: "constructor",
          kind: "constructor",
          parameters: [],
          returnType: declaringType,
        },
        {
          id: "Tsonic.CSharp.Js.Map..ctor(System.Collections.Generic.IEnumerable`1)",
          targetName: "constructor",
          kind: "constructor",
          parameters: [{ name: "entries", type: entriesEnumerableType }],
          returnType: declaringType,
        },
      ],
    },
    {
      sourceName: "get",
      members: [{
        id: "Tsonic.CSharp.Js.Map.get",
        targetName: "get",
        kind: "method",
        parameters: [{ name: "key", type: keyType }],
        returnType: { kind: "nullable", value: valueType },
      }],
    },
    {
      sourceName: "set",
      members: [{
        id: "Tsonic.CSharp.Js.Map.set",
        targetName: "set",
        kind: "method",
        parameters: [{ name: "key", type: keyType }, { name: "value", type: valueType }],
        returnType: declaringType,
      }],
    },
    {
      sourceName: "has",
      members: [{
        id: "Tsonic.CSharp.Js.Map.has",
        targetName: "has",
        kind: "method",
        parameters: [{ name: "key", type: keyType }],
        returnType: boolType,
      }],
    },
    {
      sourceName: "delete",
      members: [{
        id: "Tsonic.CSharp.Js.Map.delete",
        targetName: "delete",
        kind: "method",
        parameters: [{ name: "key", type: keyType }],
        returnType: boolType,
      }],
    },
    {
      sourceName: "clear",
      members: [{
        id: "Tsonic.CSharp.Js.Map.clear",
        targetName: "clear",
        kind: "method",
        parameters: [],
        returnType: voidType,
      }],
    },
    {
      sourceName: "keys",
      members: [{
        id: "Tsonic.CSharp.Js.Map.keys",
        targetName: "keys",
        kind: "method",
        parameters: [],
        returnType: keyEnumerableType,
      }],
    },
    {
      sourceName: "values",
      members: [{
        id: "Tsonic.CSharp.Js.Map.values",
        targetName: "values",
        kind: "method",
        parameters: [],
        returnType: valueEnumerableType,
      }],
    },
    {
      sourceName: "entries",
      members: [{
        id: "Tsonic.CSharp.Js.Map.entries",
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
          id: "Tsonic.CSharp.Js.Map.forEach(System.Action`1)",
          targetName: "forEach",
          kind: "method",
          parameters: [{ name: "callback", type: { kind: "delegate", id: "System.Action", typeArguments: [valueType] } }],
          returnType: voidType,
        },
        {
          id: "Tsonic.CSharp.Js.Map.forEach(System.Action`2)",
          targetName: "forEach",
          kind: "method",
          parameters: [{ name: "callback", type: { kind: "delegate", id: "System.Action", typeArguments: [valueType, keyType] } }],
          returnType: voidType,
        },
        {
          id: "Tsonic.CSharp.Js.Map.forEach(System.Action`3)",
          targetName: "forEach",
          kind: "method",
          parameters: [{ name: "callback", type: { kind: "delegate", id: "System.Action", typeArguments: [valueType, keyType, declaringType] } }],
          returnType: voidType,
        },
      ],
    },
  ],
} satisfies CsharpJsCollectionTypePolicy;
