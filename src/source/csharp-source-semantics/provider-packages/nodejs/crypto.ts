import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetParameter,
} from "../../surfaces/js/source-library.js";
import {
  nodeBufferExportName,
  nodeBufferModuleSpecifier,
  nodeBufferTargetType,
} from "./buffer/identities.js";
import {
  getNodejsProviderExportSignatureDeclarationTargetMember,
  nodejsProviderExportSignatureDeclarationTargetMemberIndex,
} from "./metadata-indexes.js";
import {
  nodejsClassCallTargetMetadata,
  nodejsModuleCallTargetMetadata,
} from "./members/target-member-metadata.js";
import {
  nodejsDefaultModuleObjectExports,
} from "./module-defaults.js";
import type {
  NodejsUnsupportedTargetIdentity,
} from "./members/types.js";
import type {
  NodejsClassCallTargetMetadata,
  NodejsClassCallTargetMetadataRow,
  NodejsModuleCallTargetMetadata,
  NodejsModuleCallTargetMetadataRow,
} from "./members/target-member-metadata.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
const bufferProviderType = {
  kind: "provider-ref",
  moduleSpecifier: nodeBufferModuleSpecifier,
  exportName: nodeBufferExportName,
} satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const cryptoTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.crypto", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "crypto"));
const hashTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.Hash", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "Hash"));
const hmacTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.Hmac", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "Hmac"));

const nodeCryptoHashExportName = "Hash";
const nodeCryptoHmacExportName = "Hmac";
const hashProviderType = { kind: "provider-ref", moduleSpecifier: "node:crypto", exportName: nodeCryptoHashExportName } satisfies ProviderTypeExpression;
const hmacProviderType = { kind: "provider-ref", moduleSpecifier: "node:crypto", exportName: nodeCryptoHmacExportName } satisfies ProviderTypeExpression;

type NodeCryptoCallTargetMember = NodejsModuleCallTargetMetadata;
type NodeCryptoClassCallTargetMember = NodejsClassCallTargetMetadata;
type NodeCryptoCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;
type NodeCryptoClassCallTargetMetadataRow = NodejsClassCallTargetMetadataRow;

export const nodeCryptoModuleSpecifier = "node:crypto";
export const nodeCryptoRandomUuidExportName = "randomUUID";
export const nodeCryptoRandomUuidSignatureId = "node:crypto.randomUUID()";

export function nodeCryptoExports(): readonly ProviderExportDeclaration[] {
  const membersByExportName = new Map<string, readonly NodeCryptoCallTargetMember[]>();
  for (const member of nodeCryptoCallTargetMembers()) {
    membersByExportName.set(member.exportName, [...membersByExportName.get(member.exportName) ?? [], member]);
  }
  const exports = [
    nodeCryptoHashExportDeclaration(),
    nodeCryptoHmacExportDeclaration(),
    ...nodeCryptoUnsupportedFunctionDeclarations(),
    ...[...membersByExportName.entries()].map(([exportName, members]) => ({
      id: `node:crypto.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: members.map((member) => ({
        id: member.signatureId,
        parameters: member.providerParameters,
        returnType: member.providerReturnType,
      })),
    })),
  ];
  return [
    ...exports,
    ...nodejsDefaultModuleObjectExports(nodeCryptoModuleSpecifier, exports),
  ];
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
  const numberParameter = (name: string): ProviderParameterDeclaration => ({ name, type: numberProviderType });
  const optionalNumberParameter = (name: string): ProviderParameterDeclaration => ({ name, type: numberProviderType, optional: true });
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  const stringArrayProviderType = { kind: "array", elementType: stringProviderType } satisfies ProviderTypeExpression;
  const stringArrayTargetType = { kind: "array", element: stringTargetType } satisfies TargetTypeRef;
  return [
    cryptoCall({ exportName: "createHash", signatureId: "node:crypto.createHash(System.String)", targetMemberId: "Tsonic.CSharp.Node.crypto.createHash(System.String)", sourceName: "createHash", targetName: "createHash", providerParameters: [stringParameter("algorithm")], providerReturnType: hashProviderType, targetParameters: [
      targetParameter("algorithm", stringTargetType),
    ], targetReturnType: hashTargetType }),
    cryptoCall({ exportName: "createHmac", signatureId: "node:crypto.createHmac(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.crypto.createHmac(System.String,System.String)", sourceName: "createHmac", targetName: "createHmac", providerParameters: [stringParameter("algorithm"), stringParameter("key")], providerReturnType: hmacProviderType, targetParameters: [
      targetParameter("algorithm", stringTargetType),
      targetParameter("key", stringTargetType),
    ], targetReturnType: hmacTargetType }),
    cryptoCall({ exportName: "createHmac", signatureId: "node:crypto.createHmac(System.String,Tsonic.CSharp.Node.Buffer)", targetMemberId: "Tsonic.CSharp.Node.crypto.createHmac(System.String,Tsonic.CSharp.Node.Buffer)", sourceName: "createHmac", targetName: "createHmac", providerParameters: [stringParameter("algorithm"), { name: "key", type: bufferProviderType }], providerReturnType: hmacProviderType, targetParameters: [
      targetParameter("algorithm", stringTargetType),
      targetParameter("key", nodeBufferTargetType),
    ], targetReturnType: hmacTargetType }),
    cryptoCall({ exportName: "getCiphers", signatureId: "node:crypto.getCiphers()", targetMemberId: "Tsonic.CSharp.Node.crypto.getCiphers()", sourceName: "getCiphers", targetName: "getCiphers", providerParameters: [], providerReturnType: stringArrayProviderType, targetParameters: [], targetReturnType: stringArrayTargetType }),
    cryptoCall({ exportName: "getCurves", signatureId: "node:crypto.getCurves()", targetMemberId: "Tsonic.CSharp.Node.crypto.getCurves()", sourceName: "getCurves", targetName: "getCurves", providerParameters: [], providerReturnType: stringArrayProviderType, targetParameters: [], targetReturnType: stringArrayTargetType }),
    cryptoCall({ exportName: "getHashes", signatureId: "node:crypto.getHashes()", targetMemberId: "Tsonic.CSharp.Node.crypto.getHashes()", sourceName: "getHashes", targetName: "getHashes", providerParameters: [], providerReturnType: stringArrayProviderType, targetParameters: [], targetReturnType: stringArrayTargetType }),
    cryptoCall({ exportName: "randomBytes", signatureId: "node:crypto.randomBytes(System.Int32)", targetMemberId: "Tsonic.CSharp.Node.crypto.randomBytesBuffer(System.Int32)", sourceName: "randomBytes", targetName: "randomBytesBuffer", providerParameters: [numberParameter("size")], providerReturnType: bufferProviderType, targetParameters: [
      targetParameter("size", intTargetType),
    ], targetReturnType: nodeBufferTargetType }),
    cryptoCall({ exportName: "randomFillSync", signatureId: "node:crypto.randomFillSync(Tsonic.CSharp.Node.Buffer,System.Int32,System.Int32)", targetMemberId: "Tsonic.CSharp.Node.crypto.randomFillSync(Tsonic.CSharp.Node.Buffer,System.Int32,System.Int32)", sourceName: "randomFillSync", targetName: "randomFillSync", providerParameters: [
      { name: "buffer", type: bufferProviderType },
      optionalNumberParameter("offset"),
      optionalNumberParameter("size"),
    ], providerReturnType: bufferProviderType, targetParameters: [
      targetParameter("buffer", nodeBufferTargetType),
      targetParameter("offset", intTargetType, { optional: true }),
      targetParameter("size", intTargetType, { optional: true }),
    ], targetReturnType: nodeBufferTargetType }),
    cryptoCall({ exportName: "randomInt", signatureId: "node:crypto.randomInt(System.Int32,System.Int32?)", targetMemberId: "Tsonic.CSharp.Node.crypto.randomInt(System.Int32,System.Int32?)", sourceName: "randomInt", targetName: "randomInt", providerParameters: [numberParameter("minOrMax"), optionalNumberParameter("max")], providerReturnType: numberProviderType, targetParameters: [
      targetParameter("minOrMax", intTargetType),
      targetParameter("max", intTargetType, { optional: true }),
    ], targetReturnType: intTargetType }),
    cryptoCall({ exportName: nodeCryptoRandomUuidExportName, signatureId: nodeCryptoRandomUuidSignatureId, targetMemberId: "Tsonic.CSharp.Node.crypto.randomUUID()", sourceName: "randomUUID", targetName: "randomUUID", providerParameters: [], providerReturnType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    cryptoCall({ exportName: "timingSafeEqual", signatureId: "node:crypto.timingSafeEqual(Tsonic.CSharp.Node.Buffer,Tsonic.CSharp.Node.Buffer)", targetMemberId: "Tsonic.CSharp.Node.crypto.timingSafeEqual(Tsonic.CSharp.Node.Buffer,Tsonic.CSharp.Node.Buffer)", sourceName: "timingSafeEqual", targetName: "timingSafeEqual", providerParameters: [
      { name: "a", type: bufferProviderType },
      { name: "b", type: bufferProviderType },
    ], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("a", nodeBufferTargetType),
      targetParameter("b", nodeBufferTargetType),
    ], targetReturnType: boolTargetType }),
  ];
}

export function nodeCryptoClassCallTargetMembers(): readonly NodeCryptoClassCallTargetMember[] {
  return [
    ...nodeCryptoHashClassCallTargetMembers(),
    ...nodeCryptoHmacClassCallTargetMembers(),
  ];
}

function nodeCryptoHashClassCallTargetMembers(): readonly NodeCryptoClassCallTargetMember[] {
  const optionalStringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType, optional: true });
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  return [
    cryptoClassCall({ exportName: nodeCryptoHashExportName, memberName: "update", memberId: "node:crypto.Hash.update", signatureId: "node:crypto.Hash.update(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.Hash.update(System.String,System.String)", sourceName: "update", targetName: "update", memberKind: "method", providerParameters: [stringParameter("data"), optionalStringParameter("inputEncoding")], providerReturnType: hashProviderType, targetParameters: [
      targetParameter("data", stringTargetType),
      targetParameter("inputEncoding", stringTargetType, { optional: true }),
    ], targetReturnType: hashTargetType, declaringType: hashTargetType }),
    cryptoClassCall({ exportName: nodeCryptoHashExportName, memberName: "update", memberId: "node:crypto.Hash.update", signatureId: "node:crypto.Hash.update(Tsonic.CSharp.Node.Buffer)", targetMemberId: "Tsonic.CSharp.Node.Hash.update(Tsonic.CSharp.Node.Buffer)", sourceName: "update", targetName: "update", memberKind: "method", providerParameters: [{ name: "data", type: bufferProviderType }], providerReturnType: hashProviderType, targetParameters: [
      targetParameter("data", nodeBufferTargetType),
    ], targetReturnType: hashTargetType, declaringType: hashTargetType }),
    cryptoClassCall({ exportName: nodeCryptoHashExportName, memberName: "digest", memberId: "node:crypto.Hash.digest", signatureId: "node:crypto.Hash.digest(System.String)", targetMemberId: "Tsonic.CSharp.Node.Hash.digest(System.String)", sourceName: "digest", targetName: "digest", memberKind: "method", providerParameters: [stringParameter("encoding")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("encoding", stringTargetType),
    ], targetReturnType: stringTargetType, declaringType: hashTargetType }),
    cryptoClassCall({ exportName: nodeCryptoHashExportName, memberName: "digest", memberId: "node:crypto.Hash.digest", signatureId: "node:crypto.Hash.digest()", targetMemberId: "Tsonic.CSharp.Node.Hash.digestBuffer()", sourceName: "digest", targetName: "digestBuffer", memberKind: "method", providerParameters: [], providerReturnType: bufferProviderType, targetParameters: [], targetReturnType: nodeBufferTargetType, declaringType: hashTargetType }),
    cryptoClassCall({ exportName: nodeCryptoHashExportName, memberName: "copy", memberId: "node:crypto.Hash.copy", signatureId: "node:crypto.Hash.copy()", targetMemberId: "Tsonic.CSharp.Node.Hash.copy()", sourceName: "copy", targetName: "copy", memberKind: "method", providerParameters: [], providerReturnType: hashProviderType, targetParameters: [], targetReturnType: hashTargetType, declaringType: hashTargetType }),
  ];
}

function nodeCryptoHmacClassCallTargetMembers(): readonly NodeCryptoClassCallTargetMember[] {
  const optionalStringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType, optional: true });
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  return [
    cryptoClassCall({ exportName: nodeCryptoHmacExportName, memberName: "update", memberId: "node:crypto.Hmac.update", signatureId: "node:crypto.Hmac.update(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.Hmac.update(System.String,System.String)", sourceName: "update", targetName: "update", memberKind: "method", providerParameters: [stringParameter("data"), optionalStringParameter("inputEncoding")], providerReturnType: hmacProviderType, targetParameters: [
      targetParameter("data", stringTargetType),
      targetParameter("inputEncoding", stringTargetType, { optional: true }),
    ], targetReturnType: hmacTargetType, declaringType: hmacTargetType }),
    cryptoClassCall({ exportName: nodeCryptoHmacExportName, memberName: "update", memberId: "node:crypto.Hmac.update", signatureId: "node:crypto.Hmac.update(Tsonic.CSharp.Node.Buffer)", targetMemberId: "Tsonic.CSharp.Node.Hmac.update(Tsonic.CSharp.Node.Buffer)", sourceName: "update", targetName: "update", memberKind: "method", providerParameters: [{ name: "data", type: bufferProviderType }], providerReturnType: hmacProviderType, targetParameters: [
      targetParameter("data", nodeBufferTargetType),
    ], targetReturnType: hmacTargetType, declaringType: hmacTargetType }),
    cryptoClassCall({ exportName: nodeCryptoHmacExportName, memberName: "digest", memberId: "node:crypto.Hmac.digest", signatureId: "node:crypto.Hmac.digest(System.String)", targetMemberId: "Tsonic.CSharp.Node.Hmac.digest(System.String)", sourceName: "digest", targetName: "digest", memberKind: "method", providerParameters: [stringParameter("encoding")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("encoding", stringTargetType),
    ], targetReturnType: stringTargetType, declaringType: hmacTargetType }),
    cryptoClassCall({ exportName: nodeCryptoHmacExportName, memberName: "digest", memberId: "node:crypto.Hmac.digest", signatureId: "node:crypto.Hmac.digest()", targetMemberId: "Tsonic.CSharp.Node.Hmac.digestBuffer()", sourceName: "digest", targetName: "digestBuffer", memberKind: "method", providerParameters: [], providerReturnType: bufferProviderType, targetParameters: [], targetReturnType: nodeBufferTargetType, declaringType: hmacTargetType }),
  ];
}

function nodeCryptoHashExportDeclaration(): ProviderExportDeclaration {
  return cryptoClassExportDeclaration(
    nodeCryptoHashExportName,
    "Tsonic.CSharp.Node.Hash",
    nodeCryptoHashClassCallTargetMembers(),
  );
}

function nodeCryptoHmacExportDeclaration(): ProviderExportDeclaration {
  return cryptoClassExportDeclaration(
    nodeCryptoHmacExportName,
    "Tsonic.CSharp.Node.Hmac",
    nodeCryptoHmacClassCallTargetMembers(),
  );
}

function cryptoClassExportDeclaration(
  exportName: string,
  targetIdentityId: string,
  members: readonly NodeCryptoClassCallTargetMember[],
): ProviderExportDeclaration {
  return {
    id: `node:crypto.${exportName}`,
    name: exportName,
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: targetIdentityId,
      displayName: targetIdentityId,
    },
    members: providerMembersForCryptoClassCalls(members),
  };
}

export function nodeCryptoUnsupportedTargetIdentities(): readonly NodejsUnsupportedTargetIdentity[] {
  return nodeCryptoUnsupportedCalls.map(({ exportName, signatureId, targetIdentityId, displayName }) => ({
    exportName,
    signatureId,
    targetIdentityId,
    displayName,
  }));
}

function providerMembersForCryptoClassCalls(
  members: readonly NodeCryptoClassCallTargetMember[],
): readonly ProviderMemberDeclaration[] {
  const membersById = new Map<string, readonly NodeCryptoClassCallTargetMember[]>();
  for (const member of members) {
    membersById.set(member.memberId, [...membersById.get(member.memberId) ?? [], member]);
  }
  return [...membersById.values()].map((memberGroup) => {
    const first = memberGroup[0];
    if (first === undefined) {
      throw new Error("Missing C# NodeJS crypto provider member group.");
    }
    return {
      id: first.memberId,
      name: first.memberName,
      kind: first.memberKind,
      ...(first.static === true ? { static: true } : {}),
      signatures: memberGroup.map((member) => ({
        id: member.signatureId,
        parameters: member.providerParameters,
        ...(member.providerReturnType !== undefined ? { returnType: member.providerReturnType } : {}),
      })),
    };
  });
}

function cryptoCall(row: NodeCryptoCallTargetMetadataRow): NodeCryptoCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: cryptoTargetType,
  });
}

function nodeCryptoUnsupportedFunctionDeclarations(): readonly ProviderExportDeclaration[] {
  return nodeCryptoUnsupportedCalls.map((entry) => ({
    id: `node:crypto.${entry.exportName}`,
    name: entry.exportName,
    kind: "function",
    signatures: [{
      id: entry.signatureId,
      parameters: entry.providerParameters,
      returnType: entry.providerReturnType,
    }],
  }));
}

function optionalUnknownParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: unknownProviderType,
    optional: true,
  };
}

function cryptoClassCall(row: NodeCryptoClassCallTargetMetadataRow): NodeCryptoClassCallTargetMember {
  return nodejsClassCallTargetMetadata(row);
}

const nodeCryptoCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodeCryptoModuleSpecifier, nodeCryptoCallTargetMembers());

const nodeCryptoUnsupportedCalls = [
  {
    exportName: "createCipheriv",
    signatureId: "node:crypto.createCipheriv(System.String,System.Object,System.Object)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.crypto.createCipheriv(System.String,System.Object,System.Object)",
    displayName: "unsupported NodeJS crypto.createCipheriv",
    providerParameters: [
      { name: "algorithm", type: stringProviderType },
      { name: "key", type: unknownProviderType },
      { name: "iv", type: unknownProviderType },
    ],
    providerReturnType: unknownProviderType,
  },
  {
    exportName: "createDecipheriv",
    signatureId: "node:crypto.createDecipheriv(System.String,System.Object,System.Object)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.crypto.createDecipheriv(System.String,System.Object,System.Object)",
    displayName: "unsupported NodeJS crypto.createDecipheriv",
    providerParameters: [
      { name: "algorithm", type: stringProviderType },
      { name: "key", type: unknownProviderType },
      { name: "iv", type: unknownProviderType },
    ],
    providerReturnType: unknownProviderType,
  },
  {
    exportName: "scryptSync",
    signatureId: "node:crypto.scryptSync(System.Object,System.Object,System.Int32,System.Object)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.crypto.scryptSync(System.Object,System.Object,System.Int32,System.Object)",
    displayName: "unsupported NodeJS crypto.scryptSync",
    providerParameters: [
      { name: "password", type: unknownProviderType },
      { name: "salt", type: unknownProviderType },
      { name: "keylen", type: numberProviderType },
      optionalUnknownParameter("options"),
    ],
    providerReturnType: bufferProviderType,
  },
  {
    exportName: "pbkdf2Sync",
    signatureId: "node:crypto.pbkdf2Sync(System.Object,System.Object,System.Int32,System.Int32,System.String)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.crypto.pbkdf2Sync(System.Object,System.Object,System.Int32,System.Int32,System.String)",
    displayName: "unsupported NodeJS crypto.pbkdf2Sync",
    providerParameters: [
      { name: "password", type: unknownProviderType },
      { name: "salt", type: unknownProviderType },
      { name: "iterations", type: numberProviderType },
      { name: "keylen", type: numberProviderType },
      { name: "digest", type: stringProviderType },
    ],
    providerReturnType: bufferProviderType,
  },
  {
    exportName: "createSign",
    signatureId: "node:crypto.createSign(System.String)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.crypto.createSign(System.String)",
    displayName: "unsupported NodeJS crypto.createSign",
    providerParameters: [{ name: "algorithm", type: stringProviderType }],
    providerReturnType: unknownProviderType,
  },
  {
    exportName: "createVerify",
    signatureId: "node:crypto.createVerify(System.String)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.crypto.createVerify(System.String)",
    displayName: "unsupported NodeJS crypto.createVerify",
    providerParameters: [{ name: "algorithm", type: stringProviderType }],
    providerReturnType: unknownProviderType,
  },
] satisfies readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
}[];
