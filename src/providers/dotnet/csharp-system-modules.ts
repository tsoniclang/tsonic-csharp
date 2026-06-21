import type {
  DotnetModuleModel,
  DotnetTypeRef,
} from "./model.js";
import { createDotnetModuleSpecifier } from "./module-specifier.js";
import {
  constructorMember,
  indexerMember,
  methodMember,
  namedType,
  parameter,
  propertyMember,
  restParameter,
  sourcePrimitiveType,
  staticMethodMember,
  staticPropertyMember,
  typeParameterType,
} from "./csharp-system-provider-builders.js";

const systemModule = createDotnetModuleSpecifier("System");
const systemIoModule = createDotnetModuleSpecifier("System.IO");
const collectionsGenericModule = createDotnetModuleSpecifier("System.Collections.Generic");

const stringType = namedType("System.String", { kind: "string" });
const boolType = sourcePrimitiveType("bool");
const intType = sourcePrimitiveType("int32");
const doubleType = sourcePrimitiveType("float64");
const voidType = { kind: "void" } satisfies DotnetTypeRef;
const listItemType = typeParameterType("T");

export const csharpSystemModules = [
  systemDotnetModule(),
  systemIoDotnetModule(),
  collectionsGenericDotnetModule(),
] as const;

const csharpSystemModuleBySpecifier = new Map<string, DotnetModuleModel>(
  csharpSystemModules.map((module) => [module.moduleSpecifier, module]),
);

export function getCsharpSystemModule(specifier: string): DotnetModuleModel | undefined {
  return csharpSystemModuleBySpecifier.get(specifier);
}

export function hasCsharpSystemModule(specifier: string): boolean {
  return csharpSystemModuleBySpecifier.has(specifier);
}

function systemDotnetModule(): DotnetModuleModel {
  return {
    moduleSpecifier: systemModule,
    namespaceName: "System",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Console",
        namespaceName: "System",
        metadataName: "System.Console",
        displayName: "System.Console",
        members: [
          staticMethodMember("System.Console.Write(System.String)", "write", [
            parameter("value", stringType),
          ], voidType),
          staticMethodMember("System.Console.WriteLine()", "writeLine", [], voidType),
          staticMethodMember("System.Console.WriteLine(System.String)", "writeLine", [
            parameter("value", stringType),
          ], voidType),
          staticMethodMember("System.Console.WriteLine(System.Int32)", "writeLine", [
            parameter("value", intType),
          ], voidType),
          staticMethodMember("System.Console.WriteLine(System.Double)", "writeLine", [
            parameter("value", doubleType),
          ], voidType),
          staticMethodMember("System.Console.WriteLine(System.Boolean)", "writeLine", [
            parameter("value", boolType),
          ], voidType),
          staticMethodMember("System.Console.ReadLine()", "readLine", [], stringType),
        ],
      },
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Math",
        namespaceName: "System",
        metadataName: "System.Math",
        displayName: "System.Math",
        members: [
          staticMethodMember("System.Math.Abs(System.Double)", "abs", [
            parameter("value", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Acos(System.Double)", "acos", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Asin(System.Double)", "asin", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Atan(System.Double)", "atan", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Atan2(System.Double,System.Double)", "atan2", [
            parameter("y", doubleType),
            parameter("x", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Cos(System.Double)", "cos", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Cosh(System.Double)", "cosh", [
            parameter("value", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Exp(System.Double)", "exp", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Log(System.Double)", "log", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Log10(System.Double)", "log10", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Log2(System.Double)", "log2", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Max(System.Double,System.Double)", "max", [
            parameter("val1", doubleType),
            parameter("val2", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Min(System.Double,System.Double)", "min", [
            parameter("val1", doubleType),
            parameter("val2", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Pow(System.Double,System.Double)", "pow", [
            parameter("x", doubleType),
            parameter("y", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Sin(System.Double)", "sin", [
            parameter("a", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Sinh(System.Double)", "sinh", [
            parameter("value", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Sqrt(System.Double)", "sqrt", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Tan(System.Double)", "tan", [
            parameter("a", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Tanh(System.Double)", "tanh", [
            parameter("value", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Truncate(System.Double)", "trunc", [
            parameter("d", doubleType),
          ], doubleType),
        ],
      },
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Exception",
        namespaceName: "System",
        metadataName: "System.Exception",
        displayName: "System.Exception",
        members: [
          constructorMember("System.Exception..ctor(System.String)", [
            parameter("message", stringType),
          ]),
          propertyMember("System.Exception.Message", "message", stringType),
          methodMember("System.Exception.ToString()", "toString", [], stringType),
        ],
      },
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Convert",
        namespaceName: "System",
        metadataName: "System.Convert",
        displayName: "System.Convert",
        members: [
          staticMethodMember("System.Convert.ToByte(System.Double)", "toByte", [
            parameter("value", doubleType),
          ], sourcePrimitiveType("uint8")),
          staticMethodMember("System.Convert.ToInt32(System.Double)", "toInt32", [
            parameter("value", doubleType),
          ], intType),
          staticMethodMember("System.Convert.ToString(System.Double)", "toString", [
            parameter("value", doubleType),
          ], stringType),
        ],
      },
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Environment",
        namespaceName: "System",
        metadataName: "System.Environment",
        displayName: "System.Environment",
        members: [
          staticPropertyMember("System.Environment.NewLine", "newLine", stringType),
          staticMethodMember("System.Environment.Exit(System.Int32)", "exit", [
            parameter("exitCode", intType),
          ], { kind: "void" }),
        ],
      },
      {
        kind: "type",
        typeKind: "class",
        sourceName: "CLSCompliantAttribute",
        namespaceName: "System",
        metadataName: "System.CLSCompliantAttribute",
        displayName: "System.CLSCompliantAttribute",
        members: [
          constructorMember("System.CLSCompliantAttribute..ctor(System.Boolean)", [
            parameter("isCompliant", boolType),
          ]),
        ],
      },
    ],
  };
}

function systemIoDotnetModule(): DotnetModuleModel {
  return {
    moduleSpecifier: systemIoModule,
    namespaceName: "System.IO",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "File",
        namespaceName: "System.IO",
        metadataName: "System.IO.File",
        displayName: "System.IO.File",
        members: [
          staticMethodMember("System.IO.File.Exists(System.String)", "exists", [
            parameter("path", stringType),
          ], boolType),
          staticMethodMember("System.IO.File.ReadAllText(System.String)", "readAllText", [
            parameter("path", stringType),
          ], stringType),
          staticMethodMember("System.IO.File.WriteAllText(System.String,System.String)", "writeAllText", [
            parameter("path", stringType),
            parameter("contents", stringType),
          ], voidType),
        ],
      },
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Path",
        namespaceName: "System.IO",
        metadataName: "System.IO.Path",
        displayName: "System.IO.Path",
        members: [
          staticMethodMember("System.IO.Path.Combine(System.String[])", "combine", [
            restParameter("paths", {
              kind: "array",
              elementType: stringType,
            }),
          ], stringType),
          staticMethodMember("System.IO.Path.GetFileName(System.String)", "getFileName", [
            parameter("path", stringType),
          ], stringType),
          staticMethodMember("System.IO.Path.GetDirectoryName(System.String)", "getDirectoryName", [
            parameter("path", stringType),
          ], stringType),
        ],
      },
    ],
  };
}

function collectionsGenericDotnetModule(): DotnetModuleModel {
  return {
    moduleSpecifier: collectionsGenericModule,
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
          ], { kind: "void" }),
          methodMember("System.Collections.Generic.List`1.Clear()", "clear", [], { kind: "void" }),
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
          ], { kind: "void" }),
          methodMember("System.Collections.Generic.List`1.ToArray()", "toArray", [], {
            kind: "array",
            elementType: listItemType,
          }),
        ],
      },
    ],
  };
}
