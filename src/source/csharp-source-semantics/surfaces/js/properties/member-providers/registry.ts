import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLengthMember,
} from "../../arrays.js";
import {
  getCollectionPropertyTargetMember,
} from "../../collections.js";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  type JsSurfaceSourceIdentitySelector,
  jsSurfaceTargetMemberFromMetadata,
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
} from "../../target-member-metadata.js";
import {
  propertyPrecheckRows,
} from "./precheck-rules.js";
import {
  int32PropertyReturnType,
  propertyMemberProviderBySourceIdentity,
} from "./target-member-resolvers.js";
import type {
  CsharpJsPropertyMemberProviderKind,
  CsharpJsPropertyPrecheckRule,
  CsharpJsPropertyPrecheckResult,
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
    : propertyMemberFromProvider(provider.member, sourceMember, receiverType);
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
  provider: CsharpJsPropertyMemberProviderKind,
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  switch (provider.kind) {
    case "metadata-row":
      return singlePropertyMember(provider.members);
    case "collection-size":
      return getCollectionPropertyTargetMember(sourceMember, receiverType);
    case "string-length":
      return jsSurfaceTargetMemberFromMetadata({
        id: "tsonic.csharp.js.String.length",
        sourceName: "length",
        targetName: "Length",
        kind: "property",
        returnType: int32PropertyReturnType,
      });
    case "array-length": {
      const lengthMember = receiverType?.kind === "array"
        ? "length"
        : getCsharpArrayLengthMember(receiverType);
      return lengthMember === undefined
        ? undefined
        : jsSurfaceTargetMemberFromMetadata({
            id: "tsonic.csharp.js.Array.length",
            sourceName: "length",
            targetName: lengthMember,
            kind: "property",
            returnType: int32PropertyReturnType,
          });
    }
  }
}

function singlePropertyMember(members: readonly TargetMember[]): TargetMember | undefined {
  return members.length === 1 ? members[0] : undefined;
}
