import type {
  ProviderExportDeclaration,
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
import {
  getNodejsProviderExportSignatureDeclarationTargetMember,
  nodejsProviderExportSignatureDeclarationTargetMemberIndex,
} from "./metadata-indexes.js";
import {
  nodejsModuleCallTargetMetadata,
} from "./members/target-member-metadata.js";
import type {
  NodejsModuleCallTargetMetadata,
  NodejsModuleCallTargetMetadataRow,
} from "./members/target-member-metadata.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const cryptoTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.crypto", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "crypto"));

type NodeCryptoCallTargetMember = NodejsModuleCallTargetMetadata;
type NodeCryptoCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;

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
  return getNodejsProviderExportSignatureDeclarationTargetMember(
    nodeCryptoCallTargetMemberByProviderDeclarationIdentity,
    nodeCryptoModuleSpecifier,
    exportName,
    signatureId,
  );
}

export function nodeCryptoCallTargetMembers(): readonly NodeCryptoCallTargetMember[] {
  const numberParameter = (name: string) => ({ name, type: numberProviderType });
  const optionalNumberParameter = (name: string) => ({ name, type: numberProviderType, optional: true });
  const stringArrayProviderType = { kind: "array", elementType: stringProviderType } satisfies ProviderTypeExpression;
  const stringArrayTargetType = { kind: "array", element: stringTargetType } satisfies TargetTypeRef;
  return [
    cryptoCall({ exportName: "getCiphers", signatureId: "node:crypto.getCiphers()", targetMemberId: "Tsonic.CSharp.Node.crypto.getCiphers()", sourceName: "getCiphers", targetName: "getCiphers", providerParameters: [], providerReturnType: stringArrayProviderType, targetParameters: [], targetReturnType: stringArrayTargetType }),
    cryptoCall({ exportName: "getCurves", signatureId: "node:crypto.getCurves()", targetMemberId: "Tsonic.CSharp.Node.crypto.getCurves()", sourceName: "getCurves", targetName: "getCurves", providerParameters: [], providerReturnType: stringArrayProviderType, targetParameters: [], targetReturnType: stringArrayTargetType }),
    cryptoCall({ exportName: "getHashes", signatureId: "node:crypto.getHashes()", targetMemberId: "Tsonic.CSharp.Node.crypto.getHashes()", sourceName: "getHashes", targetName: "getHashes", providerParameters: [], providerReturnType: stringArrayProviderType, targetParameters: [], targetReturnType: stringArrayTargetType }),
    cryptoCall({ exportName: "randomInt", signatureId: "node:crypto.randomInt(System.Int32,System.Int32?)", targetMemberId: "Tsonic.CSharp.Node.crypto.randomInt(System.Int32,System.Int32?)", sourceName: "randomInt", targetName: "randomInt", providerParameters: [numberParameter("minOrMax"), optionalNumberParameter("max")], providerReturnType: numberProviderType, targetParameters: [
      targetParameter("minOrMax", intTargetType),
      targetParameter("max", intTargetType, { optional: true }),
    ], targetReturnType: intTargetType }),
    cryptoCall({ exportName: nodeCryptoRandomUuidExportName, signatureId: nodeCryptoRandomUuidSignatureId, targetMemberId: "Tsonic.CSharp.Node.crypto.randomUUID()", sourceName: "randomUUID", targetName: "randomUUID", providerParameters: [], providerReturnType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
  ];
}

function cryptoCall(row: NodeCryptoCallTargetMetadataRow): NodeCryptoCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: cryptoTargetType,
  });
}

const nodeCryptoCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodeCryptoModuleSpecifier, nodeCryptoCallTargetMembers());
