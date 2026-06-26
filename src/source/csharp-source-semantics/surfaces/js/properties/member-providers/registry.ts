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
import {
  sourceLibraryMemberMatches,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberName,
} from "../../source-library.js";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  jsSurfaceTargetMemberFromMetadata,
} from "../../target-member-metadata.js";
import {
  propertyPrecheckRules,
} from "./precheck-rules.js";
import {
  int32PropertyReturnType,
  propertyMemberProviders,
} from "./target-member-resolvers.js";
import type {
  CsharpJsPropertyMemberProvider,
  CsharpJsPropertyMemberProviderKind,
  CsharpJsPropertyPrecheckRule,
  CsharpJsPropertyPrecheckResult,
  CsharpJsSourceLibraryPropertyPrecheck,
} from "./types.js";

export function getCsharpJsSourceLibraryPropertyMember(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  const provider = propertyMemberProviders.find((candidate) => propertyMemberProviderApplies(candidate, sourceMember));
  return provider === undefined
    ? undefined
    : propertyMemberFromProvider(provider.member, sourceMember, receiverType);
}

export function csharpJsSourceLibraryPropertyPrecheck(sourceMember: SourceLibraryMember): CsharpJsSourceLibraryPropertyPrecheck {
  const rule = propertyPrecheckRules.find((candidate) => propertyPrecheckRuleApplies(candidate, sourceMember));
  return rule === undefined
    ? "continue"
    : propertyPrecheckResult(rule.result, sourceMember);
}

function propertyMemberProviderApplies(provider: CsharpJsPropertyMemberProvider, sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, provider.identity) &&
    (provider.excludedIdentity === undefined || !sourceLibraryMemberMatches(sourceMember, provider.excludedIdentity));
}

function propertyPrecheckRuleApplies(rule: CsharpJsPropertyPrecheckRule, sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, rule.identity);
}

function propertyPrecheckResult(
  result: CsharpJsPropertyPrecheckResult,
  sourceMember: SourceLibraryMember,
): CsharpJsSourceLibraryPropertyPrecheck {
  return typeof result === "string"
    ? result
    : result.members.get(sourceLibraryMemberName(sourceMember)).length > 0 ? "defer" : "reject-unmapped";
}

function propertyMemberFromProvider(
  provider: CsharpJsPropertyMemberProviderKind,
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  const sourceName = sourceLibraryMemberName(sourceMember);
  switch (provider.kind) {
    case "metadata-by-source-name":
      return singlePropertyMember(provider.members.get(sourceName));
    case "collection-size":
      return getCollectionPropertyTargetMember(sourceMember, receiverType);
    case "string-length":
      return jsSurfaceTargetMemberFromMetadata({
        id: "tsonic.csharp.js.String.length",
        sourceName,
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
            id: `tsonic.csharp.js.${sourceLibraryMemberIdentity(sourceMember)}`,
            sourceName,
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
