import type {
  TargetMember,
} from "@tsonic/tsts";
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
  nodejsTargetMemberMetadataRecords,
} from "./provider-records.js";

export function getNodejsCallTargetMemberFromMetadata(
  declaration: NodejsProviderDeclarationIdentity,
): TargetMember | undefined {
  if (declaration.signatureId === undefined) {
    return undefined;
  }
  return getNodejsTargetMemberFromMetadata(declaration);
}

export function getNodejsPropertyTargetMemberFromMetadata(
  declaration: NodejsProviderDeclarationIdentity,
): TargetMember | undefined {
  return getNodejsTargetMemberFromMetadata(declaration);
}

function getNodejsTargetMemberFromMetadata(declaration: NodejsProviderDeclarationIdentity): TargetMember | undefined {
  const canonicalDeclaration = canonicalNodejsDeclarationIdentity(declaration);
  return nodejsTargetMemberByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(canonicalDeclaration));
}

const nodejsTargetMemberByDeclarationIdentity = new Map<string, TargetMember>(
  nodejsTargetMemberMetadataRecords().flatMap((record) =>
    record.declarationIdentities.map((identity) => [
      nodejsProviderDeclarationIdentityKey(identity),
      record.member,
    ] as const)
  ),
);
