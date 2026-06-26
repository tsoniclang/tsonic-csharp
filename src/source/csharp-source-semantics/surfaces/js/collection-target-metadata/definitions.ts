import type {
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberMatches,
} from "../source-library.js";
import {
  getSourceStandardLibraryDeclaringNameForType,
} from "../../../source-type-classification.js";
import type {
  CsharpJsCollectionMemberPolicy,
  CsharpJsCollectionTypePolicy,
} from "./types.js";
import {
  csharpJsMapCollectionPolicy,
} from "./map-policy.js";
import {
  csharpJsSetCollectionPolicy,
} from "./set-policy.js";
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
  return csharpJsCollectionPolicies.find((policy) =>
    sourceLibraryMemberMatches(sourceMember, sourceMemberIdentityPolicyForCollection(policy))
  );
}

export function collectionMemberPolicyApplies(
  policy: CsharpJsCollectionTypePolicy,
  memberPolicy: CsharpJsCollectionMemberPolicy,
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceLibraryMemberMatches(sourceMember, sourceMemberIdentityPolicyForCollectionMember(policy, memberPolicy));
}

export function collectionPolicyForSourceType(type: Type, context: ExtensionObservationContext): CsharpJsCollectionTypePolicy | undefined {
  const declaringName = getSourceStandardLibraryDeclaringNameForType(type, context);
  return declaringName === undefined ? undefined : collectionPolicyForSourceName(declaringName);
}

export const collectionSizeIdentityPolicy = sourceMemberIdentityPolicyForSourceNames(
  csharpJsCollectionPolicies.flatMap((policy) => policy.sourceNames),
  "size",
);

export function collectionPolicyForTargetType(type: TargetTypeRef | undefined): CsharpJsCollectionTypePolicy | undefined {
  return csharpJsCollectionPolicies.find((policy) => csharpJsCollectionTargetTypeMatches(policy, type));
}

function sourceMemberIdentityPolicyForCollection(
  policy: CsharpJsCollectionTypePolicy,
): SourceLibraryMemberIdentityPolicy {
  return sourceMemberIdentityPolicyForSourceNames(policy.sourceNames);
}

function sourceMemberIdentityPolicyForCollectionMember(
  policy: CsharpJsCollectionTypePolicy,
  memberPolicy: CsharpJsCollectionMemberPolicy,
): SourceLibraryMemberIdentityPolicy {
  return sourceMemberIdentityPolicyForSourceNames(policy.sourceNames, memberPolicy.sourceName);
}

function sourceMemberIdentityPolicyForSourceNames(
  sourceNames: readonly string[],
  memberName?: string,
): SourceLibraryMemberIdentityPolicy {
  return memberName === undefined
    ? { prefixes: sourceNames.map((sourceName) => `${sourceName}.`) as NonNullable<SourceLibraryMemberIdentityPolicy["prefixes"]> }
    : { ids: sourceLibraryMemberIdSet(sourceNames.map((sourceName) => `${sourceName}.${memberName}`) as Parameters<typeof sourceLibraryMemberIdSet>[0]) };
}
