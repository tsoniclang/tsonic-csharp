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
const collectionsGenericModule = createDotnetModuleSpecifier("System.Collections.Generic");

const stringType = namedType("System.String", { kind: "string" });
const boolType = sourcePrimitiveType("bool");
const intType = sourcePrimitiveType("int32");
const doubleType = sourcePrimitiveType("float64");
const listItemType = typeParameterType("T");

const csharpSystemModules = [
  systemDotnetModule(),
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
