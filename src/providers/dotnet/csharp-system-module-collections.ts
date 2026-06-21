import type {
  DotnetModuleModel,
} from "./model.js";
import {
  createDotnetModuleSpecifier,
} from "./module-specifier.js";
import {
  constructorMember,
  indexerMember,
  methodMember,
  parameter,
  propertyMember,
} from "./csharp-system-provider-builders.js";
import {
  boolType,
  intType,
  listItemType,
  voidType,
} from "./csharp-system-type-refs.js";

export const collectionsGenericModuleSpecifier = createDotnetModuleSpecifier("System.Collections.Generic");

export function collectionsGenericDotnetModule(): DotnetModuleModel {
  return {
    moduleSpecifier: collectionsGenericModuleSpecifier,
    namespaceName: "System.Collections.Generic",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "List",
        namespaceName: "System.Collections.Generic",
        metadataName: "System.Collections.Generic.List`1",
        displayName: "System.Collections.Generic.List",
        typeParameters: [{ name: "T" }],
        members: [
          constructorMember("System.Collections.Generic.List`1..ctor()", []),
          constructorMember("System.Collections.Generic.List`1..ctor(System.Collections.Generic.IEnumerable`1)", [
            parameter("items", { kind: "array", elementType: listItemType }),
          ]),
          propertyMember("System.Collections.Generic.List`1.Count", "count", intType),
          indexerMember("System.Collections.Generic.List`1.Item(System.Int32)", "item", [
            parameter("index", intType),
          ], listItemType),
          methodMember("System.Collections.Generic.List`1.Add(T)", "add", [
            parameter("item", listItemType),
          ], voidType),
          methodMember("System.Collections.Generic.List`1.Clear()", "clear", [], voidType),
          methodMember("System.Collections.Generic.List`1.Contains(T)", "contains", [
            parameter("item", listItemType),
          ], boolType),
          methodMember("System.Collections.Generic.List`1.IndexOf(T)", "indexOf", [
            parameter("item", listItemType),
          ], intType),
          methodMember("System.Collections.Generic.List`1.Remove(T)", "remove", [
            parameter("item", listItemType),
          ], boolType),
          methodMember("System.Collections.Generic.List`1.RemoveAt(System.Int32)", "removeAt", [
            parameter("index", intType),
          ], voidType),
          methodMember("System.Collections.Generic.List`1.ToArray()", "toArray", [], {
            kind: "array",
            elementType: listItemType,
          }),
        ],
      },
    ],
  };
}
