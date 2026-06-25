import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  getNodeBufferTargetMember,
  nodeBufferModuleSpecifier,
} from "../buffer.js";
import {
  nodeAssertCallTargetMembers,
  nodeAssertModuleSpecifier,
} from "../assert.js";
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
} from "../os.js";
import {
  nodePathCallTargetMembers,
  nodePathModuleSpecifier,
} from "../path.js";
import {
  nodeProcessCallTargetMembers,
  nodeProcessModuleSpecifier,
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
} from "./entry-builders.js";

export function getNodejsCallTargetMember(declaration: NodejsProviderDeclarationIdentity): TargetMember | undefined {
  const canonicalDeclaration = canonicalNodejsDeclarationIdentity(declaration);
  const bufferMember = canonicalDeclaration.moduleSpecifier === nodeBufferModuleSpecifier
    ? getNodeBufferTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  if (bufferMember !== undefined) {
    return bufferMember;
  }
  const fsMember = canonicalDeclaration.moduleSpecifier === nodeFsModuleSpecifier
    ? getNodeFsTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  if (fsMember !== undefined) {
    return fsMember;
  }
  const urlMember = canonicalDeclaration.moduleSpecifier === nodeUrlModuleSpecifier
    ? getNodeUrlTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  if (urlMember !== undefined) {
    return urlMember;
  }
  return nodejsCallTargetMembersByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(canonicalDeclaration));
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
