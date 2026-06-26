import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  sourceLibraryMemberMatches,
} from "../../source-library.js";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  propertyPrecheckRules,
} from "./precheck-rules.js";
import {
  propertyMemberResolvers,
} from "./target-member-resolvers.js";
import type {
  CsharpJsPropertyMemberResolver,
  CsharpJsPropertyPrecheckRule,
  CsharpJsSourceLibraryPropertyPrecheck,
} from "./types.js";

export function getCsharpJsSourceLibraryPropertyMember(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  return propertyMemberResolvers
    .find((resolver) => propertyMemberResolverApplies(resolver, sourceMember))
    ?.resolve(sourceMember, receiverType);
}

export function csharpJsSourceLibraryPropertyPrecheck(sourceMember: SourceLibraryMember): CsharpJsSourceLibraryPropertyPrecheck {
  return propertyPrecheckRules
    .find((rule) => propertyPrecheckRuleApplies(rule, sourceMember))
    ?.result(sourceMember) ?? "continue";
}

function propertyMemberResolverApplies(resolver: CsharpJsPropertyMemberResolver, sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, resolver.identity) &&
    (resolver.excludedIdentity === undefined || !sourceLibraryMemberMatches(sourceMember, resolver.excludedIdentity));
}

function propertyPrecheckRuleApplies(rule: CsharpJsPropertyPrecheckRule, sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, rule.identity);
}
