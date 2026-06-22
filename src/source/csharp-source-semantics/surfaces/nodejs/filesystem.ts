import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const fsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.fs");

export const nodeFsModuleSpecifier = "node:fs";

export function nodeFsExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:fs.existsSync",
      name: "existsSync",
      kind: "function",
      signatures: [{
        id: "node:fs.existsSync(System.String)",
        parameters: [{ name: "path", type: stringProviderType }],
        returnType: boolProviderType,
      }],
    },
  ];
}

export function getNodeFsTargetMembers(exportName: string): readonly TargetMember[] {
  switch (exportName) {
    case "existsSync":
      return [
        targetMethod(
          "Tsonic.CSharp.Node.fs.existsSync(System.String)",
          "existsSync",
          "existsSync",
          [targetParameter("path", stringTargetType)],
          boolTargetType,
          {
            declaringType: fsTargetType,
            static: true,
          },
        ),
      ];
    default:
      return [];
  }
}
