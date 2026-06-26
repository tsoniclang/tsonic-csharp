import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetParameter,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const cryptoTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.crypto", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "crypto"));

interface NodeCryptoCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetMemberId: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

export const nodeCryptoModuleSpecifier = "node:crypto";
export const nodeCryptoRandomUuidExportName = "randomUUID";
export const nodeCryptoRandomUuidSignatureId = "node:crypto.randomUUID()";

export function nodeCryptoExports(): readonly ProviderExportDeclaration[] {
  const membersByExportName = new Map<string, readonly NodeCryptoCallTargetMember[]>();
  for (const member of nodeCryptoCallTargetMembers()) {
    membersByExportName.set(member.exportName, [...membersByExportName.get(member.exportName) ?? [], member]);
  }
  return [...membersByExportName.entries()].map(([exportName, members]) => ({
    id: `node:crypto.${exportName}`,
    name: exportName,
    kind: "function" as const,
    signatures: members.map((member) => ({
      id: member.signatureId,
      parameters: member.providerParameters,
      returnType: member.providerReturnType,
    })),
  }));
}

export function getNodeCryptoRandomUuidTargetMember(): TargetMember {
  const member = getNodeCryptoCallTargetMember(nodeCryptoRandomUuidExportName, nodeCryptoRandomUuidSignatureId);
  if (member === undefined) {
    throw new Error("Missing C# NodeJS crypto.randomUUID target member.");
  }
  return member;
}

export function getNodeCryptoCallTargetMember(
  exportName: string | undefined,
  signatureId: string | undefined,
): TargetMember | undefined {
  if (signatureId === undefined) {
    return undefined;
  }
  return nodeCryptoCallTargetMembers()
    .find((entry) => entry.exportName === exportName && entry.signatureId === signatureId)
    ?.member;
}

export function nodeCryptoCallTargetMembers(): readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetMemberId: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  const numberParameter = (name: string) => ({ name, type: numberProviderType });
  const optionalNumberParameter = (name: string) => ({ name, type: numberProviderType, optional: true });
  const stringArrayProviderType = { kind: "array", elementType: stringProviderType } satisfies ProviderTypeExpression;
  const stringArrayTargetType = { kind: "array", element: stringTargetType } satisfies TargetTypeRef;
  return [
    cryptoCall("getCiphers", "node:crypto.getCiphers()", "Tsonic.CSharp.Node.crypto.getCiphers()", [], stringArrayProviderType, [], stringArrayTargetType),
    cryptoCall("getCurves", "node:crypto.getCurves()", "Tsonic.CSharp.Node.crypto.getCurves()", [], stringArrayProviderType, [], stringArrayTargetType),
    cryptoCall("getHashes", "node:crypto.getHashes()", "Tsonic.CSharp.Node.crypto.getHashes()", [], stringArrayProviderType, [], stringArrayTargetType),
    cryptoCall("randomInt", "node:crypto.randomInt(System.Int32,System.Int32?)", "Tsonic.CSharp.Node.crypto.randomInt(System.Int32,System.Int32?)", [numberParameter("minOrMax"), optionalNumberParameter("max")], numberProviderType, [
      targetParameter("minOrMax", intTargetType),
      targetParameter("max", intTargetType, { optional: true }),
    ], intTargetType),
    cryptoCall(nodeCryptoRandomUuidExportName, nodeCryptoRandomUuidSignatureId, "Tsonic.CSharp.Node.crypto.randomUUID()", [], stringProviderType, [], stringTargetType),
  ];
}

function cryptoCall(
  exportName: string,
  signatureId: string,
  targetMemberId: string,
  providerParameters: readonly ProviderParameterDeclaration[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly ReturnType<typeof targetParameter>[],
  targetReturnType: TargetTypeRef,
): NodeCryptoCallTargetMember {
  return {
    exportName,
    signatureId,
    targetMemberId,
    providerParameters,
    providerReturnType,
    member: {
      id: targetMemberId,
      sourceName: exportName,
      targetName: exportName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: cryptoTargetType,
      static: true,
    },
  };
}
