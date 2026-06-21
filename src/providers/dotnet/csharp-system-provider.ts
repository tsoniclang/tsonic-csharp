import type {
  DotnetMemberDeclaration,
  DotnetModuleModel,
  DotnetParameterDeclaration,
  DotnetProviderIdentity,
  DotnetSignatureDeclaration,
  DotnetTypeRef,
} from "./model.js";
import type {
  DotnetProviderDiagnostic,
  DotnetProviderModuleContext,
  DotnetProviderModuleResult,
  DotnetProviderOwnership,
  DotnetTypeDataProvider,
} from "./provider.js";
import { createDotnetModuleSpecifier } from "./module-specifier.js";
import { dotnetModuleToProviderDeclarationModel } from "./declaration-model.js";
import type { ProviderExportDeclaration } from "@tsonic/tsts";

const providerIdentity: DotnetProviderIdentity = {
  id: "tsonic.csharp.dotnet-system-provider",
  version: "0.0.1",
  target: "csharp",
  displayName: "Tsonic C# .NET system provider",
};

const systemModule = createDotnetModuleSpecifier("System");
const systemIoModule = createDotnetModuleSpecifier("System.IO");
const collectionsGenericModule = createDotnetModuleSpecifier("System.Collections.Generic");

const stringType = namedType("System.String", { kind: "string" });
const boolType = sourcePrimitiveType("bool");
const intType = sourcePrimitiveType("int32");
const doubleType = sourcePrimitiveType("float64");
const voidType = { kind: "void" } satisfies DotnetTypeRef;
const listItemType = typeParameterType("T");

const csharpSystemModules = [
  systemDotnetModule(),
  systemIoDotnetModule(),
  collectionsGenericDotnetModule(),
] as const;

const csharpSystemModuleBySpecifier = new Map<string, DotnetModuleModel>(
  csharpSystemModules.map((module) => [module.moduleSpecifier, module]),
);

export function createCsharpDotnetSystemTypeDataProvider(): DotnetTypeDataProvider {
  return {
    identity: providerIdentity,
    ownsModule(specifier: string, _context: DotnetProviderModuleContext): DotnetProviderOwnership {
      return csharpSystemModuleBySpecifier.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    getModule(specifier: string, _context: DotnetProviderModuleContext): DotnetProviderModuleResult {
      return csharpSystemModuleBySpecifier.get(specifier) ?? dotnetProviderDiagnostic(
        "DOTNET_SYSTEM_MODULE_MISSING",
        `.NET system provider has no module model for '${specifier}'.`,
        { specifier },
      );
    },
  };
}

export function findCsharpDotnetProviderExportByTargetId(targetId: string): ProviderExportDeclaration | undefined {
  for (const module of csharpSystemModules) {
    const model = dotnetModuleToProviderDeclarationModel(module);
    const declaration = model.exports.find((candidate) =>
      candidate.targetIdentity?.target === "csharp" &&
      candidate.targetIdentity.id === targetId
    );
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
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

function constructorMember(id: string, parameters: readonly DotnetParameterDeclaration[]): DotnetMemberDeclaration {
  return {
    kind: "constructor",
    sourceName: "constructor",
    targetName: "constructor",
    metadataName: id,
    signatures: [signature(id, parameters)],
  };
}

function propertyMember(metadataName: string, sourceName: string, type: DotnetTypeRef): DotnetMemberDeclaration {
  return {
    kind: "property",
    sourceName,
    targetName: memberTargetName(metadataName),
    metadataName,
    type,
  };
}

function staticPropertyMember(metadataName: string, sourceName: string, type: DotnetTypeRef): DotnetMemberDeclaration {
  return {
    ...propertyMember(metadataName, sourceName, type),
    static: true,
  };
}

function indexerMember(
  metadataName: string,
  sourceName: string,
  parameters: readonly DotnetParameterDeclaration[],
  returnType: DotnetTypeRef,
): DotnetMemberDeclaration {
  return {
    kind: "indexer",
    sourceName,
    targetName: memberTargetName(metadataName),
    metadataName,
    signatures: [signature(metadataName, parameters, returnType)],
  };
}

function methodMember(
  metadataName: string,
  sourceName: string,
  parameters: readonly DotnetParameterDeclaration[],
  returnType: DotnetTypeRef,
): DotnetMemberDeclaration {
  return {
    kind: "method",
    sourceName,
    targetName: memberTargetName(metadataName),
    metadataName,
    signatures: [signature(metadataName, parameters, returnType)],
  };
}

function staticMethodMember(
  metadataName: string,
  sourceName: string,
  parameters: readonly DotnetParameterDeclaration[],
  returnType: DotnetTypeRef,
): DotnetMemberDeclaration {
  return {
    ...methodMember(metadataName, sourceName, parameters, returnType),
    static: true,
  };
}

function signature(
  id: string,
  parameters: readonly DotnetParameterDeclaration[],
  returnType?: DotnetTypeRef,
): DotnetSignatureDeclaration {
  return {
    id,
    parameters,
    ...(returnType !== undefined ? { returnType } : {}),
  };
}

function parameter(name: string, type: DotnetTypeRef): DotnetParameterDeclaration {
  return {
    name,
    type,
    passingMode: "by-value",
  };
}

function restParameter(name: string, type: DotnetTypeRef): DotnetParameterDeclaration {
  return {
    name,
    type,
    passingMode: "by-value",
    rest: true,
  };
}

function namedType(metadataName: string, sourceShape?: DotnetTypeRef): DotnetTypeRef {
  return {
    kind: "named",
    metadataName,
    displayName: metadataName,
    ...(sourceShape !== undefined ? { sourceShape } : {}),
  };
}

function sourcePrimitiveType(name: "bool" | "uint8" | "int32" | "float64"): DotnetTypeRef;
function sourcePrimitiveType(name: "bool" | "uint8" | "int32" | "float64"): DotnetTypeRef {
  return {
    kind: "source-primitive",
    name,
  };
}

function typeParameterType(name: string): DotnetTypeRef {
  return {
    kind: "type-parameter",
    name,
  };
}

function memberTargetName(metadataName: string): string {
  const methodIndex = metadataName.indexOf("(");
  const name = methodIndex === -1 ? metadataName : metadataName.slice(0, methodIndex);
  return name.slice(name.lastIndexOf(".") + 1);
}

function dotnetProviderDiagnostic(
  code: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): DotnetProviderDiagnostic {
  return {
    code,
    message,
    evidence: [evidence],
  };
}
