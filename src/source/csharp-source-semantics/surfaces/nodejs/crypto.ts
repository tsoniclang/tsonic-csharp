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
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const cryptoTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.crypto", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "crypto"));

export const nodeCryptoModuleSpecifier = "node:crypto";

export function nodeCryptoExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:crypto.randomUUID",
      name: "randomUUID",
      kind: "function",
      signatures: [{
        id: "node:crypto.randomUUID()",
        parameters: [],
        returnType: stringProviderType,
      }],
    },
  ];
}

export function getNodeCryptoTargetMembers(exportName: string): readonly TargetMember[] {
  switch (exportName) {
    case "randomUUID":
      return [
        targetMethod(
          "Tsonic.CSharp.Node.crypto.randomUUID()",
          "randomUUID",
          "randomUUID",
          [],
          stringTargetType,
          {
            declaringType: cryptoTargetType,
            static: true,
          },
        ),
      ];
    default:
      return [];
  }
}
