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
  nodejsExportSignatureDeclarationIdentity,
  nodejsProviderDeclarationIdentityKey,
} from "./identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";

export function isNodejsProviderModule(moduleSpecifier: string | undefined): boolean {
  return moduleSpecifier === nodePathModuleSpecifier ||
    moduleSpecifier === nodeFsModuleSpecifier ||
    moduleSpecifier === nodeCryptoModuleSpecifier ||
    moduleSpecifier === nodeOsModuleSpecifier ||
    moduleSpecifier === nodeProcessModuleSpecifier;
}

export function getNodejsCallTargetMember(declaration: NodejsProviderDeclarationIdentity): TargetMember | undefined {
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
  ...nodejsCallTargetMemberEntries(nodePathModuleSpecifier, nodePathJoinExportName, nodePathJoinSignatureId, getNodePathJoinTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeFsModuleSpecifier, nodeFsExistsSyncExportName, nodeFsExistsSyncSignatureId, getNodeFsExistsSyncTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeCryptoModuleSpecifier, nodeCryptoRandomUuidExportName, nodeCryptoRandomUuidSignatureId, getNodeCryptoRandomUuidTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeOsModuleSpecifier, nodeOsHomedirExportName, nodeOsHomedirSignatureId, getNodeOsHomedirTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeOsModuleSpecifier, nodeOsPlatformExportName, nodeOsPlatformSignatureId, getNodeOsPlatformTargetMember()),
  ...nodejsCallTargetMemberEntries(nodeProcessModuleSpecifier, nodeProcessCwdExportName, nodeProcessCwdSignatureId, getNodeProcessCwdTargetMember()),
]);

const nodejsPropertyTargetMembersByDeclarationIdentity = new Map<string, TargetMember>([
  [nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(nodeProcessModuleSpecifier, nodeProcessPlatformExportName)), getNodeProcessPlatformTargetMember()],
]);

const nodejsTargetMembersByProviderSymbolIdentity = new Map<string, TargetMember>([
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
