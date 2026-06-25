import type {
  TargetMember,
  TargetOperationFact,
} from "@tsonic/tsts";
import type {
  CsharpTargetOperationFact,
} from "../../../../csharp-facts.js";
import {
  csharpTargetOperationFromMember,
  targetOperationFromMember,
} from "../../../operations.js";
import {
  getNodeBufferLengthTargetMember,
  nodeBufferExportName,
  nodeBufferLengthMemberId,
  nodeBufferModuleSpecifier,
} from "../buffer.js";
import {
  getNodeFsTargetMember,
  nodeFsModuleSpecifier,
} from "../filesystem.js";
import {
  nodeOsModuleSpecifier,
  nodeOsPropertyTargetMembers,
} from "../os.js";
import {
  getNodePathTargetMember,
  nodePathModuleSpecifier,
  nodePathPropertyTargetMembers,
} from "../path.js";
import {
  nodeProcessModuleSpecifier,
  nodeProcessPropertyTargetMembers,
} from "../process.js";
import {
  getNodeUrlTargetMember,
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
  nodejsPropertyTargetMemberEntriesForModule,
} from "./entry-builders.js";
import {
  canonicalNodejsDeclarationIdentity,
} from "./provider-identity.js";

export function getCsharpNodejsPropertyOperation(
  declaration: NodejsProviderDeclarationIdentity,
): { readonly operation: TargetOperationFact; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  const canonicalDeclaration = canonicalNodejsDeclarationIdentity(declaration);
  const pathMember = canonicalDeclaration.moduleSpecifier === nodePathModuleSpecifier
    ? getNodePathTargetMember(canonicalDeclaration.memberId)
    : undefined;
  const fsMember = canonicalDeclaration.moduleSpecifier === nodeFsModuleSpecifier
    ? getNodeFsTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  const urlMember = canonicalDeclaration.moduleSpecifier === nodeUrlModuleSpecifier
    ? getNodeUrlTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  const member = pathMember
    ?? fsMember
    ?? urlMember
    ?? nodejsPropertyTargetMembersByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(canonicalDeclaration));
  return member === undefined
    ? undefined
    : {
        operation: targetOperationFromMember(member),
        csharpOperation: csharpTargetOperationFromMember(member),
      };
}

const nodejsPropertyTargetMembersByDeclarationIdentity = new Map<string, TargetMember>([
  [nodejsProviderDeclarationIdentityKey(nodejsExportMemberDeclarationIdentity(nodeBufferModuleSpecifier, nodeBufferExportName, "length", nodeBufferLengthMemberId)), getNodeBufferLengthTargetMember()],
  ...nodejsPropertyTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathPropertyTargetMembers()),
  ...nodejsPropertyTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsPropertyTargetMembers()),
  ...nodejsPropertyTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessPropertyTargetMembers()),
]);
