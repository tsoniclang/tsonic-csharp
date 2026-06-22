import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const pathTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.path", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "path"));

export const nodePathModuleSpecifier = "node:path";
export const nodePathJoinExportName = "join";
export const nodePathJoinSignatureId = "node:path.join(System.String[])";

export function nodePathExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:path.join",
      name: nodePathJoinExportName,
      kind: "function",
      signatures: [{
        id: nodePathJoinSignatureId,
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

export function getNodePathJoinTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.path.join(System.String[])",
    nodePathJoinExportName,
    nodePathJoinExportName,
    [targetParameter("paths", stringTargetType, { paramsArray: true })],
    stringTargetType,
    {
      declaringType: pathTargetType,
      static: true,
    },
  );
}
