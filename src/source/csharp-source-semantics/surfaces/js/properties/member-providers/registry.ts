import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isCsharpReadOnlyIndexableCollectionTargetType,
} from "../../../../target-types.js";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  type JsSurfaceSourceIdentitySelector,
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
} from "../../target-member-metadata.js";
import {
  propertyPrecheckRows,
} from "./precheck-rules.js";
import {
  propertyMemberProviderBySourceIdentity,
} from "./target-member-resolvers.js";
import type {
  CsharpJsPropertyMemberProviderValue,
  CsharpJsPropertyPrecheckRule,
  CsharpJsPropertyPrecheckResult,
  CsharpJsReceiverPropertyMember,
  CsharpJsReceiverPropertySelector,
  CsharpJsSourceLibraryPropertyPrecheck,
} from "./types.js";

export function getCsharpJsSourceLibraryPropertyMember(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  const provider = propertyMemberProviderBySourceIdentity.get(selectedIdentity.key);
  return provider === undefined
    ? undefined
    : propertyMemberFromProvider(provider.member, receiverType);
}

export function csharpJsSourceLibraryPropertyPrecheck(sourceMember: SourceLibraryMember): CsharpJsSourceLibraryPropertyPrecheck {
  const rule = jsSurfaceSelectMetadataRowForSourceIdentity(
    propertyPrecheckRows,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
    propertyPrecheckRuleSelectors,
  );
  return rule === undefined
    ? "continue"
    : propertyPrecheckResult(rule.result);
}

function propertyPrecheckRuleSelectors(rule: CsharpJsPropertyPrecheckRule): readonly JsSurfaceSourceIdentitySelector[] {
  return [
    ...(rule.sourceId === undefined ? [] : [{ ids: [rule.sourceId] }]),
    ...(rule.identity === undefined ? [] : [rule.identity]),
  ];
}

function propertyPrecheckResult(
  result: CsharpJsPropertyPrecheckResult,
): ReturnType<typeof csharpJsSourceLibraryPropertyPrecheck> {
  return typeof result === "string"
    ? result
    : result.members.length > 0 ? "defer" : "reject-unmapped";
}

function propertyMemberFromProvider(
  provider: CsharpJsPropertyMemberProviderValue,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  if (provider.members !== undefined) {
    return singlePropertyMember(provider.members);
  }
  if (provider.receiverMembers !== undefined) {
    return selectReceiverPropertyMember(provider.receiverMembers, receiverType);
  }
  return undefined;
}

function singlePropertyMember(members: readonly TargetMember[]): TargetMember | undefined {
  return members.length === 1 ? members[0] : undefined;
}

function selectReceiverPropertyMember(
  members: readonly CsharpJsReceiverPropertyMember[],
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  const match = members.find((member) => receiverPropertySelectorMatches(member.receiver, receiverType));
  if (match === undefined) {
    return undefined;
  }
  return {
    ...match.member,
    ...(match.useReceiverAsDeclaringType === true && receiverType !== undefined ? { declaringType: receiverType } : {}),
  };
}

function receiverPropertySelectorMatches(
  selector: CsharpJsReceiverPropertySelector,
  receiverType: TargetTypeRef | undefined,
): boolean {
  switch (selector.kind) {
    case "target-array":
      return receiverType?.kind === "array";
    case "target-id":
      return receiverType?.kind === "target-named" && receiverType.id === selector.id;
    case "target-feature":
      return selector.feature === "read-only-indexable" && isCsharpReadOnlyIndexableCollectionTargetType(receiverType);
  }
}
