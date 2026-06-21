import type {
  DotnetModuleModel,
} from "./model.js";
import {
  createDotnetModuleSpecifier,
} from "./module-specifier.js";
import {
  constructorMember,
  methodMember,
  parameter,
  propertyMember,
  sourcePrimitiveType,
  staticMethodMember,
  staticPropertyMember,
} from "./csharp-system-provider-builders.js";
import {
  boolType,
  doubleType,
  intType,
  stringType,
  voidType,
} from "./csharp-system-type-refs.js";

export const systemModuleSpecifier = createDotnetModuleSpecifier("System");

export function systemDotnetModule(): DotnetModuleModel {
  return {
    moduleSpecifier: systemModuleSpecifier,
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
          staticMethodMember("System.Console.Write(System.String)", "write", "Write", [
            parameter("value", stringType),
          ], voidType),
          staticMethodMember("System.Console.WriteLine()", "writeLine", "WriteLine", [], voidType),
          staticMethodMember("System.Console.WriteLine(System.String)", "writeLine", "WriteLine", [
            parameter("value", stringType),
          ], voidType),
          staticMethodMember("System.Console.WriteLine(System.Int32)", "writeLine", "WriteLine", [
            parameter("value", intType),
          ], voidType),
          staticMethodMember("System.Console.WriteLine(System.Double)", "writeLine", "WriteLine", [
            parameter("value", doubleType),
          ], voidType),
          staticMethodMember("System.Console.WriteLine(System.Boolean)", "writeLine", "WriteLine", [
            parameter("value", boolType),
          ], voidType),
          staticMethodMember("System.Console.ReadLine()", "readLine", "ReadLine", [], stringType),
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
          staticMethodMember("System.Math.Abs(System.Double)", "abs", "Abs", [
            parameter("value", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Acos(System.Double)", "acos", "Acos", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Asin(System.Double)", "asin", "Asin", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Atan(System.Double)", "atan", "Atan", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Atan2(System.Double,System.Double)", "atan2", "Atan2", [
            parameter("y", doubleType),
            parameter("x", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Cos(System.Double)", "cos", "Cos", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Cosh(System.Double)", "cosh", "Cosh", [
            parameter("value", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Exp(System.Double)", "exp", "Exp", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Log(System.Double)", "log", "Log", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Log10(System.Double)", "log10", "Log10", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Log2(System.Double)", "log2", "Log2", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Max(System.Double,System.Double)", "max", "Max", [
            parameter("val1", doubleType),
            parameter("val2", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Min(System.Double,System.Double)", "min", "Min", [
            parameter("val1", doubleType),
            parameter("val2", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Pow(System.Double,System.Double)", "pow", "Pow", [
            parameter("x", doubleType),
            parameter("y", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Sin(System.Double)", "sin", "Sin", [
            parameter("a", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Sinh(System.Double)", "sinh", "Sinh", [
            parameter("value", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Sqrt(System.Double)", "sqrt", "Sqrt", [
            parameter("d", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Tan(System.Double)", "tan", "Tan", [
            parameter("a", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Tanh(System.Double)", "tanh", "Tanh", [
            parameter("value", doubleType),
          ], doubleType),
          staticMethodMember("System.Math.Truncate(System.Double)", "trunc", "Truncate", [
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
          propertyMember("System.Exception.Message", "message", "Message", stringType),
          methodMember("System.Exception.ToString()", "toString", "ToString", [], stringType),
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
          staticMethodMember("System.Convert.ToByte(System.Double)", "toByte", "ToByte", [
            parameter("value", doubleType),
          ], sourcePrimitiveType("uint8")),
          staticMethodMember("System.Convert.ToInt32(System.Double)", "toInt32", "ToInt32", [
            parameter("value", doubleType),
          ], intType),
          staticMethodMember("System.Convert.ToString(System.Double)", "toString", "ToString", [
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
          staticPropertyMember("System.Environment.NewLine", "newLine", "NewLine", stringType),
          staticMethodMember("System.Environment.Exit(System.Int32)", "exit", "Exit", [
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
