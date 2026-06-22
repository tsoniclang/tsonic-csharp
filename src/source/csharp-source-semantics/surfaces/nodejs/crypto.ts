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
export const nodeCryptoRandomUuidExportName = "randomUUID";
export const nodeCryptoRandomUuidSignatureId = "node:crypto.randomUUID()";

export function nodeCryptoExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:crypto.randomUUID",
      name: nodeCryptoRandomUuidExportName,
      kind: "function",
      signatures: [{
        id: nodeCryptoRandomUuidSignatureId,
        parameters: [],
        returnType: stringProviderType,
      }],
    },
  ];
}

export function getNodeCryptoRandomUuidTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.crypto.randomUUID()",
    nodeCryptoRandomUuidExportName,
    nodeCryptoRandomUuidExportName,
    [],
    stringTargetType,
    {
      declaringType: cryptoTargetType,
      static: true,
    },
  );
}
