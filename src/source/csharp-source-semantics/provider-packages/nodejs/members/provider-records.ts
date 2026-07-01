import type {
  ProviderSymbolIdentity,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import {
  nodeAssertCallTargetMembers,
  nodeAssertModuleSpecifier,
  nodeAssertUnsupportedTargetIdentities,
} from "../assert.js";
import {
  nodeBufferClassCallTargetMembers,
  nodeBufferClassPropertyTargetMembers,
  nodeBufferModuleCallTargetMembers,
  nodeBufferModuleSpecifier,
  nodeBufferUnsupportedTargetIdentities,
} from "../buffer.js";
import {
  nodeCryptoClassCallTargetMembers,
  nodeCryptoCallTargetMembers,
  nodeCryptoModuleSpecifier,
  nodeCryptoUnsupportedTargetIdentities,
} from "../crypto.js";
import {
  nodeFsCallTargetMembers,
  nodeFsClassCallTargetMembers,
  nodeFsClassPropertyTargetMembers,
  nodeFsModuleSpecifier,
  nodeFsPromisesCallTargetMembers,
  nodeFsPromisesModuleSpecifier,
  nodeFsUnsupportedTargetIdentities,
} from "../filesystem/index.js";
import {
  nodeOsCallTargetMembers,
  nodeOsModuleSpecifier,
  nodeOsPropertyTargetMembers,
  nodeOsUnsupportedTargetIdentities,
} from "../os.js";
import {
  nodePathCallTargetMembers,
  nodePathClassPropertyTargetMembers,
  nodePathModuleSpecifier,
  nodePathPathModuleClassCallTargetMembers,
  nodePathPathModulePropertyTargetMembers,
  nodePathPropertyTargetMembers,
} from "../path.js";
import {
  nodeProcessClassPropertyTargetMembers,
  nodeProcessCallTargetMembers,
  nodeProcessModuleSpecifier,
  nodeProcessPropertyTargetMembers,
  nodeProcessUnsupportedTargetIdentities,
} from "../process.js";
import {
  nodeUtilCallTargetMembers,
  nodeUtilModuleSpecifier,
  nodeUtilUnsupportedTargetIdentities,
} from "../util.js";
import {
  nodeUrlCallTargetMembers,
  nodeUrlClassCallTargetMembers,
  nodeUrlClassPropertyTargetMembers,
  nodeUrlModuleSpecifier,
  nodeUrlUnsupportedTargetIdentities,
} from "../url.js";
import {
  nodejsExportDeclarationIdentity,
  nodejsExportMemberDeclarationIdentity,
  nodejsExportMemberSignatureDeclarationIdentity,
  nodejsExportSignatureDeclarationIdentity,
} from "../identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "../identity.js";
import type {
  NodejsClassCallTargetMember,
  NodejsClassPropertyTargetMember,
  NodejsModuleCallTargetMember,
  NodejsModulePropertyTargetMember,
  NodejsUnsupportedTargetIdentity,
} from "./types.js";

export interface NodejsTargetMemberMetadataRecord {
  readonly declarationIdentities: readonly NodejsProviderDeclarationIdentity[];
  readonly symbolIdentities: readonly ProviderSymbolIdentity[];
  readonly member: CsharpTargetMember;
}

export interface NodejsUnsupportedTargetMetadataRecord {
  readonly symbolIdentities: readonly ProviderSymbolIdentity[];
  readonly identity: NodejsUnsupportedTargetIdentity;
}

export function nodejsTargetMemberMetadataRecords(): readonly NodejsTargetMemberMetadataRecord[] {
  return [
    ...moduleCallRecords(nodeBufferModuleSpecifier, nodeBufferModuleCallTargetMembers()),
    ...classCallRecords(nodeBufferModuleSpecifier, nodeBufferClassCallTargetMembers()),
    ...classPropertyRecords(nodeBufferModuleSpecifier, nodeBufferClassPropertyTargetMembers()),
    ...moduleCallRecords(nodeAssertModuleSpecifier, nodeAssertCallTargetMembers()),
    ...moduleCallRecords(nodePathModuleSpecifier, nodePathCallTargetMembers()),
    ...modulePropertyRecords(nodePathModuleSpecifier, nodePathPropertyTargetMembers()),
    ...classCallRecords(nodePathModuleSpecifier, nodePathPathModuleClassCallTargetMembers()),
    ...classPropertyRecords(nodePathModuleSpecifier, nodePathPathModulePropertyTargetMembers()),
    ...classPropertyRecords(nodePathModuleSpecifier, nodePathClassPropertyTargetMembers()),
    ...moduleCallRecords(nodeFsModuleSpecifier, nodeFsCallTargetMembers()),
    ...classCallRecords(nodeFsModuleSpecifier, nodeFsClassCallTargetMembers()),
    ...classPropertyRecords(nodeFsModuleSpecifier, nodeFsClassPropertyTargetMembers()),
    ...moduleCallRecords(nodeFsPromisesModuleSpecifier, nodeFsPromisesCallTargetMembers()),
    ...moduleCallRecords(nodeCryptoModuleSpecifier, nodeCryptoCallTargetMembers()),
    ...classCallRecords(nodeCryptoModuleSpecifier, nodeCryptoClassCallTargetMembers()),
    ...moduleCallRecords(nodeOsModuleSpecifier, nodeOsCallTargetMembers()),
    ...modulePropertyRecords(nodeOsModuleSpecifier, nodeOsPropertyTargetMembers()),
    ...moduleCallRecords(nodeProcessModuleSpecifier, nodeProcessCallTargetMembers()),
    ...modulePropertyRecords(nodeProcessModuleSpecifier, nodeProcessPropertyTargetMembers()),
    ...classPropertyRecords(nodeProcessModuleSpecifier, nodeProcessClassPropertyTargetMembers()),
    ...moduleCallRecords(nodeUtilModuleSpecifier, nodeUtilCallTargetMembers()),
    ...moduleCallRecords(nodeUrlModuleSpecifier, nodeUrlCallTargetMembers()),
    ...classCallRecords(nodeUrlModuleSpecifier, nodeUrlClassCallTargetMembers()),
    ...classPropertyRecords(nodeUrlModuleSpecifier, nodeUrlClassPropertyTargetMembers()),
  ];
}

export function nodejsUnsupportedTargetMetadataRecords(): readonly NodejsUnsupportedTargetMetadataRecord[] {
  return [
    ...unsupportedRecords(nodeAssertModuleSpecifier, nodeAssertUnsupportedTargetIdentities()),
    ...unsupportedRecords(nodeBufferModuleSpecifier, nodeBufferUnsupportedTargetIdentities()),
    ...unsupportedRecords(nodeCryptoModuleSpecifier, nodeCryptoUnsupportedTargetIdentities()),
    ...unsupportedRecords(nodeFsModuleSpecifier, nodeFsUnsupportedTargetIdentities()),
    ...unsupportedRecords(nodeOsModuleSpecifier, nodeOsUnsupportedTargetIdentities()),
    ...unsupportedRecords(nodeUtilModuleSpecifier, nodeUtilUnsupportedTargetIdentities()),
    ...unsupportedRecords(nodeProcessModuleSpecifier, nodeProcessUnsupportedTargetIdentities()),
    ...unsupportedRecords(nodeUrlModuleSpecifier, nodeUrlUnsupportedTargetIdentities()),
  ];
}

function moduleCallRecords(
  moduleSpecifier: string,
  entries: readonly NodejsModuleCallTargetMember[],
): readonly NodejsTargetMemberMetadataRecord[] {
  return entries.map((entry) => ({
    declarationIdentities: [
      nodejsExportSignatureDeclarationIdentity(moduleSpecifier, entry.exportName, entry.signatureId),
    ],
    symbolIdentities: [
      { moduleSpecifier, exportName: entry.exportName, signatureId: entry.signatureId },
    ],
    member: entry.member,
  }));
}

function modulePropertyRecords(
  moduleSpecifier: string,
  entries: readonly NodejsModulePropertyTargetMember[],
): readonly NodejsTargetMemberMetadataRecord[] {
  return entries.map((entry) => ({
    declarationIdentities: [
      nodejsExportDeclarationIdentity(moduleSpecifier, entry.exportName),
    ],
    symbolIdentities: [
      { moduleSpecifier, exportName: entry.exportName },
    ],
    member: entry.member,
  }));
}

function classCallRecords(
  moduleSpecifier: string,
  entries: readonly NodejsClassCallTargetMember[],
): readonly NodejsTargetMemberMetadataRecord[] {
  return entries.map((entry) => ({
    declarationIdentities: [
      nodejsExportMemberDeclarationIdentity(moduleSpecifier, entry.exportName, entry.memberName, entry.memberId),
      nodejsExportMemberSignatureDeclarationIdentity(moduleSpecifier, entry.exportName, entry.memberName, entry.memberId, entry.signatureId),
    ],
    symbolIdentities: [
      { moduleSpecifier, exportName: entry.exportName, memberName: entry.memberName, signatureId: entry.signatureId },
    ],
    member: entry.member,
  }));
}

function classPropertyRecords(
  moduleSpecifier: string,
  entries: readonly NodejsClassPropertyTargetMember[],
): readonly NodejsTargetMemberMetadataRecord[] {
  return entries.map((entry) => ({
    declarationIdentities: [
      nodejsExportMemberDeclarationIdentity(moduleSpecifier, entry.exportName, entry.memberName, entry.memberId),
    ],
    symbolIdentities: [
      { moduleSpecifier, exportName: entry.exportName, memberName: entry.memberName },
    ],
    member: entry.member,
  }));
}

function unsupportedRecords(
  moduleSpecifier: string,
  entries: readonly NodejsUnsupportedTargetIdentity[],
): readonly NodejsUnsupportedTargetMetadataRecord[] {
  return entries.map((identity) => ({
    symbolIdentities: [
      {
        moduleSpecifier,
        exportName: identity.exportName,
        ...(identity.memberName !== undefined ? { memberName: identity.memberName } : {}),
      },
      ...(identity.signatureId === undefined
        ? []
        : [{
            moduleSpecifier,
            exportName: identity.exportName,
            ...(identity.memberName !== undefined ? { memberName: identity.memberName } : {}),
            signatureId: identity.signatureId,
          }]),
    ],
    identity,
  }));
}
