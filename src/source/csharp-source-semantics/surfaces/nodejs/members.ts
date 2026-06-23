import type {
  ProviderSymbolIdentity,
  TargetIdentity,
  TargetMember,
  TargetOperationFact,
} from "@tsonic/tsts";
import type {
  CsharpTargetOperationFact,
} from "../../../csharp-facts.js";
import {
  csharpTargetOperationFromMember,
  targetOperationFromMember,
} from "../../operations.js";
import {
  csharpTargetId,
} from "../../identity.js";
import {
  getNodeBufferLengthTargetMember,
  getNodeBufferTargetMember,
  nodeBufferAllocExportName,
  nodeBufferAllocMemberId,
  nodeBufferAllocSignatureId,
  nodeBufferByteLengthExportName,
  nodeBufferByteLengthMemberId,
  nodeBufferByteLengthSignatureId,
  nodeBufferExportName,
  nodeBufferFromExportName,
  nodeBufferFromStringMemberId,
  nodeBufferFromStringSignatureId,
  nodeBufferLengthMemberId,
  nodeBufferModuleSpecifier,
  nodeBufferToStringExportName,
  nodeBufferToStringMemberId,
  nodeBufferToStringSignatureId,
} from "./buffer.js";
import {
  getNodeCryptoRandomUuidTargetMember,
  nodeCryptoRandomUuidExportName,
  nodeCryptoModuleSpecifier,
  nodeCryptoRandomUuidSignatureId,
} from "./crypto.js";
import {
  nodeFsExistsSyncExportName,
  getNodeFsExistsSyncTargetMember,
  nodeFsExistsSyncSignatureId,
  nodeFsModuleSpecifier,
} from "./filesystem.js";
import {
  getNodeOsHomedirTargetMember,
  getNodeOsPlatformTargetMember,
  nodeOsHomedirExportName,
  nodeOsHomedirSignatureId,
  nodeOsModuleSpecifier,
  nodeOsPlatformExportName,
  nodeOsPlatformSignatureId,
} from "./os.js";
import {
  nodePathJoinExportName,
  getNodePathJoinTargetMember,
  nodePathJoinSignatureId,
  nodePathModuleSpecifier,
} from "./path.js";
import {
  getNodeProcessCwdTargetMember,
  getNodeProcessPlatformTargetMember,
  nodeProcessCwdExportName,
  nodeProcessCwdSignatureId,
  nodeProcessModuleSpecifier,
  nodeProcessPlatformExportName,
} from "./process.js";
import {
  nodejsExportDeclarationIdentity,
  nodejsExportMemberDeclarationIdentity,
  nodejsExportSignatureDeclarationIdentity,
  nodejsProviderDeclarationIdentityKey,
} from "./identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";

export function isNodejsProviderModule(moduleSpecifier: string | undefined): boolean {
  return moduleSpecifier === nodeBufferModuleSpecifier ||
    moduleSpecifier === nodePathModuleSpecifier ||
    moduleSpecifier === nodeFsModuleSpecifier ||
    moduleSpecifier === nodeCryptoModuleSpecifier ||
    moduleSpecifier === nodeOsModuleSpecifier ||
    moduleSpecifier === nodeProcessModuleSpecifier;
}

export function getNodejsCallTargetMember(declaration: NodejsProviderDeclarationIdentity): TargetMember | undefined {
  const bufferMember = declaration.moduleSpecifier === nodeBufferModuleSpecifier
    ? getNodeBufferTargetMember(declaration.memberId, declaration.signatureId)
    : undefined;
  if (bufferMember !== undefined) {
    return bufferMember;
  }
  return nodejsCallTargetMembersByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(declaration));
}

export function getCsharpNodejsStaticPropertyOperation(
  declaration: NodejsProviderDeclarationIdentity,
): { readonly operation: TargetOperationFact; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  const member = nodejsPropertyTargetMembersByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(declaration));
  return member === undefined
    ? undefined
    : {
        operation: targetOperationFromMember(member),
        csharpOperation: csharpTargetOperationFromMember(member),
      };
}

export function getNodejsStaticPropertyDeclaration(
  moduleSpecifier: string,
  exportName: string,
): NodejsProviderDeclarationIdentity | undefined {
  const declaration = nodejsExportDeclarationIdentity(moduleSpecifier, exportName);
  return nodejsPropertyTargetMembersByDeclarationIdentity.has(nodejsProviderDeclarationIdentityKey(declaration))
    ? declaration
    : undefined;
}

export function getNodejsTargetIdentity(symbol: ProviderSymbolIdentity): TargetIdentity | undefined {
  const member = nodejsTargetMembersByProviderSymbolIdentity.get(nodejsProviderSymbolIdentityKey(symbol));
  return member === undefined
    ? undefined
    : {
        target: csharpTargetId,
        id: member.id,
        displayName: member.targetName,
      };
}

const nodejsCallTargetMembersByDeclarationIdentity = new Map<string, TargetMember>([
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "atob", "node:buffer.atob(System.String)", requiredNodeBufferTargetMember(undefined, "node:buffer.atob(System.String)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "btoa", "node:buffer.btoa(System.String)", requiredNodeBufferTargetMember(undefined, "node:buffer.btoa(System.String)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "isAscii", "node:buffer.isAscii(Tsonic.CSharp.Node.Buffer)", requiredNodeBufferTargetMember(undefined, "node:buffer.isAscii(Tsonic.CSharp.Node.Buffer)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "isUtf8", "node:buffer.isUtf8(Tsonic.CSharp.Node.Buffer)", requiredNodeBufferTargetMember(undefined, "node:buffer.isUtf8(Tsonic.CSharp.Node.Buffer)")),
  ...nodejsCallTargetMemberEntries(nodePathModuleSpecifier, nodePathJoinExportName, nodePathJoinSignatureId, getNodePathJoinTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeFsModuleSpecifier, nodeFsExistsSyncExportName, nodeFsExistsSyncSignatureId, getNodeFsExistsSyncTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeCryptoModuleSpecifier, nodeCryptoRandomUuidExportName, nodeCryptoRandomUuidSignatureId, getNodeCryptoRandomUuidTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeOsModuleSpecifier, nodeOsHomedirExportName, nodeOsHomedirSignatureId, getNodeOsHomedirTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeOsModuleSpecifier, nodeOsPlatformExportName, nodeOsPlatformSignatureId, getNodeOsPlatformTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeProcessModuleSpecifier, nodeProcessCwdExportName, nodeProcessCwdSignatureId, getNodeProcessCwdTargetMember()),
]);

const nodejsPropertyTargetMembersByDeclarationIdentity = new Map<string, TargetMember>([
  [nodejsProviderDeclarationIdentityKey(nodejsExportMemberDeclarationIdentity(nodeBufferModuleSpecifier, nodeBufferExportName, "length", nodeBufferLengthMemberId)), getNodeBufferLengthTargetMember()],
  [nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(nodeProcessModuleSpecifier, nodeProcessPlatformExportName)), getNodeProcessPlatformTargetMember()],
]);

const nodejsTargetMembersByProviderSymbolIdentity = new Map<string, TargetMember>([
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferFromExportName, nodeBufferFromStringSignatureId, requiredNodeBufferTargetMember(nodeBufferFromStringMemberId, nodeBufferFromStringSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferAllocExportName, nodeBufferAllocSignatureId, requiredNodeBufferTargetMember(nodeBufferAllocMemberId, nodeBufferAllocSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferByteLengthExportName, nodeBufferByteLengthSignatureId, requiredNodeBufferTargetMember(nodeBufferByteLengthMemberId, nodeBufferByteLengthSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferToStringExportName, nodeBufferToStringSignatureId, requiredNodeBufferTargetMember(nodeBufferToStringMemberId, nodeBufferToStringSignatureId)),
  [nodejsProviderSymbolIdentityKey({ moduleSpecifier: nodeBufferModuleSpecifier, exportName: nodeBufferExportName, memberName: "length" }), getNodeBufferLengthTargetMember()],
  ...nodejsProviderSymbolTargetMemberEntries(nodePathModuleSpecifier, nodePathJoinExportName, nodePathJoinSignatureId, getNodePathJoinTargetMember()),
  ...nodejsProviderSymbolTargetMemberEntries(nodeFsModuleSpecifier, nodeFsExistsSyncExportName, nodeFsExistsSyncSignatureId, getNodeFsExistsSyncTargetMember()),
  ...nodejsProviderSymbolTargetMemberEntries(nodeCryptoModuleSpecifier, nodeCryptoRandomUuidExportName, nodeCryptoRandomUuidSignatureId, getNodeCryptoRandomUuidTargetMember()),
  ...nodejsProviderSymbolTargetMemberEntries(nodeOsModuleSpecifier, nodeOsHomedirExportName, nodeOsHomedirSignatureId, getNodeOsHomedirTargetMember()),
  ...nodejsProviderSymbolTargetMemberEntries(nodeOsModuleSpecifier, nodeOsPlatformExportName, nodeOsPlatformSignatureId, getNodeOsPlatformTargetMember()),
  ...nodejsProviderSymbolTargetMemberEntries(nodeProcessModuleSpecifier, nodeProcessCwdExportName, nodeProcessCwdSignatureId, getNodeProcessCwdTargetMember()),
  ...nodejsProviderSymbolTargetMemberEntries(nodeProcessModuleSpecifier, nodeProcessPlatformExportName, undefined, getNodeProcessPlatformTargetMember()),
]);

function nodejsCallTargetMemberEntries(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string,
  member: TargetMember,
): readonly (readonly [string, TargetMember])[] {
  return [
    [nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(moduleSpecifier, exportName)), member],
    [nodejsProviderDeclarationIdentityKey(nodejsExportSignatureDeclarationIdentity(moduleSpecifier, exportName, signatureId)), member],
  ];
}

function nodejsProviderMemberSymbolTargetMemberEntries(
  moduleSpecifier: string,
  exportName: string,
  memberName: string,
  signatureId: string,
  member: TargetMember,
): readonly (readonly [string, TargetMember])[] {
  return [
    [nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName, memberName }), member],
    [nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName, memberName, signatureId }), member],
  ];
}

function requiredNodeBufferTargetMember(
  memberId: string | undefined,
  signatureId: string | undefined,
): TargetMember {
  const member = getNodeBufferTargetMember(memberId, signatureId);
  if (member === undefined) {
    throw new Error(`Missing C# NodeJS Buffer target member '${signatureId ?? memberId ?? ""}'.`);
  }
  return member;
}

function nodejsProviderSymbolTargetMemberEntries(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string | undefined,
  member: TargetMember,
): readonly (readonly [string, TargetMember])[] {
  return [
    [nodejsProviderExportSymbolIdentityKey(moduleSpecifier, exportName, undefined), member],
    ...(signatureId === undefined ? [] : [[nodejsProviderExportSymbolIdentityKey(moduleSpecifier, exportName, signatureId), member] as const]),
  ];
}

function nodejsProviderSymbolIdentityKey(
  symbol: ProviderSymbolIdentity,
): string {
  return [
    symbol.moduleSpecifier,
    symbol.exportName ?? "",
    symbol.memberName ?? "",
    symbol.signatureId ?? "",
  ].join("\u0000");
}

function nodejsProviderExportSymbolIdentityKey(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string | undefined,
): string {
  return nodejsProviderSymbolIdentityKey({
    moduleSpecifier,
    exportName,
    ...(signatureId !== undefined ? { signatureId } : {}),
  });
}
