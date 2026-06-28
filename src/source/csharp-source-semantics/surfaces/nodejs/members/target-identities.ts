import type {
  ProviderSymbolIdentity,
  TargetIdentity,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import {
  csharpTargetId,
} from "../../../identity.js";
import {
  canonicalNodejsModuleSpecifier,
} from "../module-specifiers.js";
import {
  nodejsProviderSymbolIdentityKey,
} from "./provider-identity.js";
import type {
  NodejsUnsupportedTargetIdentity,
} from "./types.js";
import {
  nodejsTargetMemberMetadataRecords,
  nodejsUnsupportedTargetMetadataRecords,
} from "./provider-records.js";

export function getNodejsTargetIdentity(symbol: ProviderSymbolIdentity): TargetIdentity | undefined {
  const canonicalSpecifier = canonicalNodejsModuleSpecifier(symbol.moduleSpecifier);
  const canonicalSymbol = canonicalSpecifier === undefined
    ? undefined
    : {
        ...symbol,
        moduleSpecifier: canonicalSpecifier,
      };
  if (canonicalSymbol === undefined) {
    return undefined;
  }
  const member = nodejsTargetMemberBySymbolIdentity.get(nodejsProviderSymbolIdentityKey(canonicalSymbol));
  if (member !== undefined) {
    return {
      target: csharpTargetId,
      id: member.id,
      displayName: member.targetName,
    };
  }
  const unsupported = nodejsUnsupportedIdentityBySymbolIdentity.get(nodejsProviderSymbolIdentityKey(canonicalSymbol));
  return unsupported === undefined
    ? undefined
    : {
        target: csharpTargetId,
        id: unsupported.targetIdentityId,
        displayName: unsupported.displayName,
      };
}

const nodejsTargetMemberBySymbolIdentity = new Map<string, CsharpTargetMember>(
  nodejsTargetMemberMetadataRecords().flatMap((record) =>
    record.symbolIdentities.map((identity) => [
      nodejsProviderSymbolIdentityKey(identity),
      record.member,
    ] as const)
  ),
);

const nodejsUnsupportedIdentityBySymbolIdentity = new Map<string, NodejsUnsupportedTargetIdentity>(
  nodejsUnsupportedTargetMetadataRecords().flatMap((record) =>
    record.symbolIdentities.map((identity) => [
      nodejsProviderSymbolIdentityKey(identity),
      record.identity,
    ] as const)
  ),
);
