import type {
  DotnetModuleModel,
} from "./model.js";
import {
  createDotnetModuleSpecifier,
} from "./module-specifier.js";
import {
  parameter,
  restParameter,
  staticMethodMember,
} from "./csharp-system-provider-builders.js";
import {
  boolType,
  stringType,
  voidType,
} from "./csharp-system-type-refs.js";

export const systemIoModuleSpecifier = createDotnetModuleSpecifier("System.IO");

export function systemIoDotnetModule(): DotnetModuleModel {
  return {
    moduleSpecifier: systemIoModuleSpecifier,
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
