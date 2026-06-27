import type {
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
  SourceLibraryMemberKey,
  SourceLibraryMemberKeyPrefix,
} from "../source-library.js";
import {
  type JsSurfaceSelectedSourceIdentity,
  type JsSurfaceSourceIdentitySelector,
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceSourceIdentityMatchesSelector,
} from "../target-member-metadata.js";
import {
  getSourceStandardLibraryDeclaringNameForType,
} from "../../../source-type-classification.js";
import type {
  CsharpJsCollectionMemberPolicy,
  CsharpJsCollectionTypePolicy,
} from "./types.js";
import {
  csharpJsMapCollectionPolicy,
} from "./map-metadata.js";
import {
  csharpJsSetCollectionPolicy,
} from "./set-metadata.js";
import {
  csharpJsCollectionTargetTypeMatches,
} from "./target-types.js";

export const csharpJsCollectionPolicies: readonly CsharpJsCollectionTypePolicy[] = [
  csharpJsMapCollectionPolicy,
  csharpJsSetCollectionPolicy,
];

const collectionPoliciesBySourceName = new Map<string, CsharpJsCollectionTypePolicy>(
  csharpJsCollectionPolicies.flatMap((policy) =>
    policy.sourceNames.map((sourceName) => [sourceName, policy] as const)
  ),
);

export function collectionPolicyForSourceName(sourceName: string): CsharpJsCollectionTypePolicy | undefined {
  return collectionPoliciesBySourceName.get(sourceName);
}

export function collectionPolicyForSourceMember(sourceMember: SourceLibraryMember): CsharpJsCollectionTypePolicy | undefined {
  return collectionPolicyForSelectedSourceIdentity(jsSurfaceSelectedSourceIdentityForMember(sourceMember));
}

export function collectionPolicyForSelectedSourceIdentity(
  identity: JsSurfaceSelectedSourceIdentity,
): CsharpJsCollectionTypePolicy | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(collectionPolicyRows, identity)?.policy;
}

export function collectionMemberPolicyForSelectedSourceIdentity(
  policy: CsharpJsCollectionTypePolicy,
  identity: JsSurfaceSelectedSourceIdentity,
): CsharpJsCollectionMemberPolicy | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    policy.members,
    identity,
    (memberPolicy) => sourceMemberIdentityPolicyForCollectionMember(policy, memberPolicy),
  );
}

export function collectionPolicyForSourceType(type: Type, context: ExtensionObservationContext): CsharpJsCollectionTypePolicy | undefined {
  const declaringName = getSourceStandardLibraryDeclaringNameForType(type, context);
  return declaringName === undefined ? undefined : collectionPolicyForSourceName(declaringName);
}

export const collectionSizeIdentityPolicy = sourceMemberIdentityPolicyForSourceNames(
  csharpJsCollectionPolicies.flatMap((policy) => policy.sourceNames),
  "size",
);

export function collectionSourceIdentityMatchesSize(identity: JsSurfaceSelectedSourceIdentity): boolean {
  return jsSurfaceSourceIdentityMatchesSelector(identity, collectionSizeIdentityPolicy);
}

export function collectionPolicyForTargetType(type: TargetTypeRef | undefined): CsharpJsCollectionTypePolicy | undefined {
  return csharpJsCollectionPolicies.find((policy) => csharpJsCollectionTargetTypeMatches(policy, type));
}

function sourceMemberIdentityPolicyForCollection(
  policy: CsharpJsCollectionTypePolicy,
): JsSurfaceSourceIdentitySelector {
  return sourceMemberIdentityPolicyForSourceNames(policy.sourceNames);
}

function sourceMemberIdentityPolicyForCollectionMember(
  policy: CsharpJsCollectionTypePolicy,
  memberPolicy: CsharpJsCollectionMemberPolicy,
): JsSurfaceSourceIdentitySelector {
  return sourceMemberIdentityPolicyForSourceNames(policy.sourceNames, memberPolicy.sourceName);
}

function sourceMemberIdentityPolicyForSourceNames(
  sourceNames: readonly string[],
  memberName?: string,
): JsSurfaceSourceIdentitySelector {
  return memberName === undefined
    ? { prefixes: sourceNames.map((sourceName) => `${sourceName}.`) as SourceLibraryMemberKeyPrefix[] }
    : { ids: sourceNames.map((sourceName) => `${sourceName}.${memberName}`) as SourceLibraryMemberKey[] };
}

const collectionPolicyRows: readonly {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly policy: CsharpJsCollectionTypePolicy;
}[] = csharpJsCollectionPolicies.map((policy) => ({
  identity: sourceMemberIdentityPolicyForCollection(policy),
  policy,
}));
