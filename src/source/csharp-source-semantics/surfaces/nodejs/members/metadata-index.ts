import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  nodeAssertCallTargetMembers,
  nodeAssertModuleSpecifier,
} from "../assert.js";
import {
  getNodeBufferLengthTargetMember,
  getNodeBufferTargetMember,
  nodeBufferExportName,
  nodeBufferLengthMemberId,
  nodeBufferModuleSpecifier,
} from "../buffer.js";
import {
  nodeCryptoCallTargetMembers,
  nodeCryptoModuleSpecifier,
} from "../crypto.js";
import {
  getNodeFsTargetMember,
  nodeFsCallTargetMembers,
  nodeFsModuleSpecifier,
} from "../filesystem.js";
import {
  nodeOsCallTargetMembers,
  nodeOsModuleSpecifier,
  nodeOsPropertyTargetMembers,
} from "../os.js";
import {
  getNodePathTargetMember,
  nodePathCallTargetMembers,
  nodePathModuleSpecifier,
  nodePathPropertyTargetMembers,
} from "../path.js";
import {
  nodeProcessCallTargetMembers,
  nodeProcessModuleSpecifier,
  nodeProcessPropertyTargetMembers,
} from "../process.js";
import {
  nodeUtilCallTargetMembers,
  nodeUtilModuleSpecifier,
} from "../util.js";
import {
  getNodeUrlTargetMember,
  nodeUrlCallTargetMembers,
  nodeUrlModuleSpecifier,
} from "../url.js";
import {
  nodejsExportMemberDeclarationIdentity,
  nodejsProviderDeclarationIdentityKey,
} from "../identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "../identity.js";
import {
  canonicalNodejsDeclarationIdentity,
} from "./provider-identity.js";
import {
  nodejsCallTargetMemberEntries,
  nodejsCallTargetMemberEntriesForModule,
  nodejsPropertyTargetMemberEntriesForModule,
} from "./entry-builders.js";

export function getNodejsCallTargetMemberFromMetadata(
  declaration: NodejsProviderDeclarationIdentity,
): TargetMember | undefined {
  if (declaration.signatureId === undefined) {
    return undefined;
  }
  const canonicalDeclaration = canonicalNodejsDeclarationIdentity(declaration);
  return getDirectIdentityTargetMember(canonicalDeclaration) ??
    nodejsCallTargetMembersByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(canonicalDeclaration));
}

export function getNodejsPropertyTargetMemberFromMetadata(
  declaration: NodejsProviderDeclarationIdentity,
): TargetMember | undefined {
  const canonicalDeclaration = canonicalNodejsDeclarationIdentity(declaration);
  return getDirectIdentityTargetMember(canonicalDeclaration) ??
    nodejsPropertyTargetMembersByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(canonicalDeclaration));
}

type DirectIdentityTargetMemberResolver = (declaration: NodejsProviderDeclarationIdentity) => TargetMember | undefined;

const directIdentityTargetMemberResolversByModule = new Map<string, DirectIdentityTargetMemberResolver>([
  [nodeBufferModuleSpecifier, (declaration) => getNodeBufferTargetMember(declaration.memberId, declaration.signatureId)],
  [nodeFsModuleSpecifier, (declaration) => getNodeFsTargetMember(declaration.memberId, declaration.signatureId)],
  [nodePathModuleSpecifier, (declaration) => getNodePathTargetMember(declaration.memberId)],
  [nodeUrlModuleSpecifier, (declaration) => getNodeUrlTargetMember(declaration.memberId, declaration.signatureId)],
]);

function getDirectIdentityTargetMember(declaration: NodejsProviderDeclarationIdentity): TargetMember | undefined {
  return directIdentityTargetMemberResolversByModule.get(declaration.moduleSpecifier)?.(declaration);
}

const nodejsCallTargetMembersByDeclarationIdentity = new Map<string, TargetMember>([
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "atob", "node:buffer.atob(System.String)", requiredNodeBufferTargetMember(undefined, "node:buffer.atob(System.String)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "btoa", "node:buffer.btoa(System.String)", requiredNodeBufferTargetMember(undefined, "node:buffer.btoa(System.String)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "isAscii", "node:buffer.isAscii(Tsonic.CSharp.Node.Buffer)", requiredNodeBufferTargetMember(undefined, "node:buffer.isAscii(Tsonic.CSharp.Node.Buffer)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "isUtf8", "node:buffer.isUtf8(Tsonic.CSharp.Node.Buffer)", requiredNodeBufferTargetMember(undefined, "node:buffer.isUtf8(Tsonic.CSharp.Node.Buffer)")),
  ...nodejsCallTargetMemberEntriesForModule(nodeAssertModuleSpecifier, nodeAssertCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeFsModuleSpecifier, nodeFsCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeCryptoModuleSpecifier, nodeCryptoCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeUtilModuleSpecifier, nodeUtilCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeUrlModuleSpecifier, nodeUrlCallTargetMembers()),
]);

const nodejsPropertyTargetMembersByDeclarationIdentity = new Map<string, TargetMember>([
  [nodejsProviderDeclarationIdentityKey(nodejsExportMemberDeclarationIdentity(nodeBufferModuleSpecifier, nodeBufferExportName, "length", nodeBufferLengthMemberId)), getNodeBufferLengthTargetMember()],
  ...nodejsPropertyTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathPropertyTargetMembers()),
  ...nodejsPropertyTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsPropertyTargetMembers()),
  ...nodejsPropertyTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessPropertyTargetMembers()),
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
