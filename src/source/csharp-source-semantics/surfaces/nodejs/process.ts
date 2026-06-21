import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpTargetNamedType,
  targetMethod,
} from "../js/source-library.js";
import {
  targetProperty,
} from "../../target-types.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const stringTargetType = csharpTargetNamedType("System.String");
const processTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.process");

export const nodeProcessModuleSpecifier = "node:process";

export function nodeProcessExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:process.cwd",
      name: "cwd",
      kind: "function",
      signatures: [{
        id: "node:process.cwd()",
        parameters: [],
        returnType: stringProviderType,
      }],
    },
    {
      id: "node:process.platform",
      name: "platform",
      kind: "value",
      type: stringProviderType,
    },
  ];
}

export function getNodeProcessTargetMembers(exportName: string): readonly TargetMember[] {
  switch (exportName) {
    case "cwd":
      return [
        targetMethod(
          "Tsonic.CSharp.Node.process.cwd()",
          "cwd",
          "cwd",
          [],
          stringTargetType,
          {
            declaringType: processTargetType,
            static: true,
          },
        ),
      ];
    default:
      return [];
  }
}

export function getNodeProcessPropertyMembers(exportName: string): readonly TargetMember[] {
  switch (exportName) {
    case "platform":
      return [
        targetProperty(
          "Tsonic.CSharp.Node.process.platform",
          "platform",
          "platform",
          stringTargetType,
          {
            declaringType: processTargetType,
            static: true,
          },
        ),
      ];
    default:
      return [];
  }
}
