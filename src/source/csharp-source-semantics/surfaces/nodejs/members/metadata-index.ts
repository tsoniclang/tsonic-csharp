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
  nodejsProviderSymbolIdentityKey,
} from "./provider-identity.js";
import {
  nodejsTargetMemberMetadataRecords,
  nodejsUnsupportedTargetMetadataRecords,
} from "./provider-records.js";
import type {
  NodejsUnsupportedTargetIdentity,
} from "./types.js";

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

export function getNodejsUnsupportedTargetIdentityFromMetadata(
  declaration: NodejsProviderDeclarationIdentity,
): NodejsUnsupportedTargetIdentity | undefined {
  const canonicalDeclaration = canonicalNodejsDeclarationIdentity(declaration);
  if (canonicalDeclaration.exportName === undefined) {
    return undefined;
  }
  return nodejsUnsupportedIdentityByDeclarationSymbol.get(nodejsProviderSymbolIdentityKey({
    moduleSpecifier: canonicalDeclaration.moduleSpecifier,
    exportName: canonicalDeclaration.exportName,
    ...(canonicalDeclaration.memberName !== undefined ? { memberName: canonicalDeclaration.memberName } : {}),
    ...(canonicalDeclaration.signatureId !== undefined ? { signatureId: canonicalDeclaration.signatureId } : {}),
  }));
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

const nodejsUnsupportedIdentityByDeclarationSymbol = new Map<string, NodejsUnsupportedTargetIdentity>(
  nodejsUnsupportedTargetMetadataRecords().flatMap((record) =>
    record.symbolIdentities.map((identity) => [
      nodejsProviderSymbolIdentityKey(identity),
      record.identity,
    ] as const)
  ),
);
