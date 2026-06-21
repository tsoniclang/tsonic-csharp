import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const stringTargetType = csharpTargetNamedType("System.String");
const pathTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.path");

export const nodePathModuleSpecifier = "node:path";

export function nodePathExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:path.join",
      name: "join",
      kind: "function",
      signatures: [{
        id: "node:path.join(System.String[])",
        parameters: [{
          name: "paths",
          type: { kind: "array", elementType: stringProviderType },
          rest: true,
        }],
        returnType: stringProviderType,
      }],
    },
  ];
}

export function getNodePathTargetMembers(exportName: string): readonly TargetMember[] {
  switch (exportName) {
    case "join":
      return [
        targetMethod(
          "Tsonic.CSharp.Node.path.join(System.String[])",
          "join",
          "join",
          [targetParameter("paths", stringTargetType, { paramsArray: true })],
          stringTargetType,
          {
            declaringType: pathTargetType,
            static: true,
          },
        ),
      ];
    default:
      return [];
  }
}

export function getNodePathPropertyMembers(_exportName: string): readonly TargetMember[] {
  return [];
}
