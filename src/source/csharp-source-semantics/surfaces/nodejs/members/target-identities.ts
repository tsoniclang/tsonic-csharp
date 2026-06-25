import type {
  ProviderSymbolIdentity,
  TargetIdentity,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpTargetId,
} from "../../../identity.js";
import {
  nodeAssertCallTargetMembers,
  nodeAssertModuleSpecifier,
  nodeAssertUnsupportedTargetIdentities,
} from "../assert.js";
import {
  getNodeBufferLengthTargetMember,
  getNodeBufferTargetMember,
  nodeBufferAllocExportName,
  nodeBufferAllocMemberId,
  nodeBufferAllocSignatureId,
  nodeBufferAllocUnsafeExportName,
  nodeBufferAllocUnsafeMemberId,
  nodeBufferAllocUnsafeSignatureId,
  nodeBufferAllocUnsafeSlowExportName,
  nodeBufferAllocUnsafeSlowMemberId,
  nodeBufferAllocUnsafeSlowSignatureId,
  nodeBufferByteLengthExportName,
  nodeBufferByteLengthMemberId,
  nodeBufferByteLengthSignatureId,
  nodeBufferCompareExportName,
  nodeBufferCompareMemberId,
  nodeBufferCompareSignatureId,
  nodeBufferConcatExportName,
  nodeBufferConcatMemberId,
  nodeBufferConcatSignatureId,
  nodeBufferEqualsExportName,
  nodeBufferEqualsMemberId,
  nodeBufferEqualsSignatureId,
  nodeBufferExportName,
  nodeBufferFromExportName,
  nodeBufferFromStringMemberId,
  nodeBufferFromStringSignatureId,
  nodeBufferIsEncodingExportName,
  nodeBufferIsEncodingMemberId,
  nodeBufferIsEncodingSignatureId,
  nodeBufferModuleSpecifier,
  nodeBufferOfExportName,
  nodeBufferOfMemberId,
  nodeBufferOfSignatureId,
  nodeBufferSliceExportName,
  nodeBufferSliceMemberId,
  nodeBufferSliceSignatureId,
  nodeBufferSubarrayExportName,
  nodeBufferSubarrayMemberId,
  nodeBufferSubarraySignatureId,
  nodeBufferToStringExportName,
  nodeBufferToStringMemberId,
  nodeBufferToStringSignatureId,
} from "../buffer.js";
import {
  nodeCryptoCallTargetMembers,
  nodeCryptoModuleSpecifier,
} from "../crypto.js";
import {
  nodeFsCallTargetMembers,
  nodeFsModuleSpecifier,
} from "../filesystem.js";
import {
  nodeOsCallTargetMembers,
  nodeOsModuleSpecifier,
  nodeOsPropertyTargetMembers,
} from "../os.js";
import {
  nodePathCallTargetMembers,
  nodePathModuleSpecifier,
  nodePathPropertyTargetMembers,
} from "../path.js";
import {
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
  canonicalNodejsModuleSpecifier,
} from "../module-specifiers.js";
import {
  nodejsProviderClassCallSymbolTargetMemberEntries,
  nodejsProviderClassPropertySymbolTargetMemberEntries,
  nodejsProviderMemberSymbolTargetMemberEntries,
  nodejsProviderPropertySymbolTargetMemberEntriesForModule,
  nodejsProviderSymbolTargetMemberEntriesForModule,
  nodejsProviderUnsupportedSymbolIdentityEntries,
} from "./entry-builders.js";
import {
  nodejsProviderExportSymbolIdentityKey,
  nodejsProviderSymbolIdentityKey,
} from "./provider-identity.js";
import type {
  NodejsUnsupportedTargetIdentity,
} from "./types.js";

export function getNodejsTargetIdentity(symbol: ProviderSymbolIdentity): TargetIdentity | undefined {
  const canonicalSpecifier = canonicalNodejsModuleSpecifier(symbol.moduleSpecifier);
  const member = canonicalSpecifier === undefined
    ? undefined
    : nodejsTargetMembersByProviderSymbolIdentity.get(nodejsProviderSymbolIdentityKey({
        ...symbol,
        moduleSpecifier: canonicalSpecifier,
      }));
  if (member !== undefined) {
    return {
      target: csharpTargetId,
      id: member.id,
      displayName: member.targetName,
    };
  }
  const unsupported = canonicalSpecifier === undefined
    ? undefined
    : nodejsUnsupportedTargetIdentitiesByProviderSymbol.get(nodejsProviderSymbolIdentityKey({
        ...symbol,
        moduleSpecifier: canonicalSpecifier,
      }));
  return unsupported === undefined
    ? undefined
    : {
        target: csharpTargetId,
        id: unsupported.targetIdentityId,
        displayName: unsupported.displayName,
      };
}

const nodejsTargetMembersByProviderSymbolIdentity = new Map<string, TargetMember>([
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferFromExportName, nodeBufferFromStringSignatureId, requiredNodeBufferTargetMember(nodeBufferFromStringMemberId, nodeBufferFromStringSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferAllocExportName, nodeBufferAllocSignatureId, requiredNodeBufferTargetMember(nodeBufferAllocMemberId, nodeBufferAllocSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferAllocUnsafeExportName, nodeBufferAllocUnsafeSignatureId, requiredNodeBufferTargetMember(nodeBufferAllocUnsafeMemberId, nodeBufferAllocUnsafeSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferAllocUnsafeSlowExportName, nodeBufferAllocUnsafeSlowSignatureId, requiredNodeBufferTargetMember(nodeBufferAllocUnsafeSlowMemberId, nodeBufferAllocUnsafeSlowSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferByteLengthExportName, nodeBufferByteLengthSignatureId, requiredNodeBufferTargetMember(nodeBufferByteLengthMemberId, nodeBufferByteLengthSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferCompareExportName, nodeBufferCompareSignatureId, requiredNodeBufferTargetMember(nodeBufferCompareMemberId, nodeBufferCompareSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferConcatExportName, nodeBufferConcatSignatureId, requiredNodeBufferTargetMember(nodeBufferConcatMemberId, nodeBufferConcatSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferEqualsExportName, nodeBufferEqualsSignatureId, requiredNodeBufferTargetMember(nodeBufferEqualsMemberId, nodeBufferEqualsSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferIsEncodingExportName, nodeBufferIsEncodingSignatureId, requiredNodeBufferTargetMember(nodeBufferIsEncodingMemberId, nodeBufferIsEncodingSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferOfExportName, nodeBufferOfSignatureId, requiredNodeBufferTargetMember(nodeBufferOfMemberId, nodeBufferOfSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferSliceExportName, nodeBufferSliceSignatureId, requiredNodeBufferTargetMember(nodeBufferSliceMemberId, nodeBufferSliceSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferSubarrayExportName, nodeBufferSubarraySignatureId, requiredNodeBufferTargetMember(nodeBufferSubarrayMemberId, nodeBufferSubarraySignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferToStringExportName, nodeBufferToStringSignatureId, requiredNodeBufferTargetMember(nodeBufferToStringMemberId, nodeBufferToStringSignatureId)),
  [nodejsProviderSymbolIdentityKey({ moduleSpecifier: nodeBufferModuleSpecifier, exportName: nodeBufferExportName, memberName: "length" }), getNodeBufferLengthTargetMember()],
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeAssertModuleSpecifier, nodeAssertCallTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathCallTargetMembers()),
  ...nodejsProviderPropertySymbolTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathPropertyTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeFsModuleSpecifier, nodeFsCallTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeCryptoModuleSpecifier, nodeCryptoCallTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsCallTargetMembers()),
  ...nodejsProviderPropertySymbolTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsPropertyTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessCallTargetMembers()),
  ...nodejsProviderPropertySymbolTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessPropertyTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeUtilModuleSpecifier, nodeUtilCallTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeUrlModuleSpecifier, nodeUrlCallTargetMembers()),
  ...nodejsProviderClassCallSymbolTargetMemberEntries(nodeUrlModuleSpecifier, nodeUrlClassCallTargetMembers()),
  ...nodejsProviderClassPropertySymbolTargetMemberEntries(nodeUrlModuleSpecifier, nodeUrlClassPropertyTargetMembers()),
]);

const nodejsUnsupportedTargetIdentitiesByProviderSymbol = new Map<string, NodejsUnsupportedTargetIdentity>([
  ...nodeAssertUnsupportedTargetIdentities().flatMap((identity) =>
    nodejsProviderUnsupportedSymbolIdentityEntries(nodeAssertModuleSpecifier, identity)
  ),
  ...nodeUtilUnsupportedTargetIdentities().flatMap((identity) => [
    [nodejsProviderExportSymbolIdentityKey(nodeUtilModuleSpecifier, identity.exportName, undefined), identity] as const,
    [nodejsProviderExportSymbolIdentityKey(nodeUtilModuleSpecifier, identity.exportName, identity.signatureId), identity] as const,
  ]),
  ...nodeProcessUnsupportedTargetIdentities().map((identity) => [
    nodejsProviderExportSymbolIdentityKey(nodeProcessModuleSpecifier, identity.exportName, undefined),
    identity,
  ] as const),
  ...nodeUrlUnsupportedTargetIdentities().flatMap((identity) =>
    nodejsProviderUnsupportedSymbolIdentityEntries(nodeUrlModuleSpecifier, identity)
  ),
]);

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
