import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpTargetNamedType,
  targetMethod,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const stringTargetType = csharpTargetNamedType("System.String");
const osTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.os");

export const nodeOsModuleSpecifier = "node:os";

export function nodeOsExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:os.homedir",
      name: "homedir",
      kind: "function",
      signatures: [{
        id: "node:os.homedir()",
        parameters: [],
        returnType: stringProviderType,
      }],
    },
    {
      id: "node:os.platform",
      name: "platform",
      kind: "function",
      signatures: [{
        id: "node:os.platform()",
        parameters: [],
        returnType: stringProviderType,
      }],
    },
  ];
}

export function getNodeOsTargetMembers(exportName: string): readonly TargetMember[] {
  switch (exportName) {
    case "homedir":
      return [
        targetMethod(
          "Tsonic.CSharp.Node.os.homedir()",
          "homedir",
          "homedir",
          [],
          stringTargetType,
          {
            declaringType: osTargetType,
            static: true,
          },
        ),
      ];
    case "platform":
      return [
        targetMethod(
          "Tsonic.CSharp.Node.os.platform()",
          "platform",
          "platform",
          [],
          stringTargetType,
          {
            declaringType: osTargetType,
            static: true,
          },
        ),
      ];
    default:
      return [];
  }
}

export function getNodeOsPropertyMembers(_exportName: string): readonly TargetMember[] {
  return [];
}
