import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLengthMember,
} from "../arrays.js";
import {
  getCollectionPropertyTargetMember,
} from "../collections.js";
import {
  jsonTargetMembersForSourceName,
} from "../json.js";
import {
  mathPropertyTargetMemberForSourceName,
} from "../math.js";
import {
  numberPropertyTargetMemberForSourceName,
} from "../numbers.js";
import {
  hasObjectTargetMember,
} from "../objects.js";
import {
  regExpPropertyTargetMemberForSourceName,
} from "../regexp.js";
import type {
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../source-library.js";
import {
  csharpSourcePrimitiveTargetType,
  sourceLibraryMemberIdSet,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatches,
  sourceLibraryMemberName,
} from "../source-library.js";
import {
  jsSurfaceTargetMemberFromMetadata,
} from "../target-member-metadata.js";

export type CsharpJsSourceLibraryPropertyPrecheck = "continue" | "defer" | "reject-unmapped";

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

interface CsharpJsPropertyMemberResolver {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly excludedIdentity?: SourceLibraryMemberIdentityPolicy;
  readonly resolve: (sourceMember: SourceLibraryMember, receiverType: TargetTypeRef | undefined) => TargetMember | undefined;
}

interface CsharpJsPropertyPrecheckRule {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly result: (sourceMember: SourceLibraryMember) => CsharpJsSourceLibraryPropertyPrecheck;
}

const propertyMemberResolvers: readonly CsharpJsPropertyMemberResolver[] = [
  {
    identity: { prefixes: ["Math."] },
    excludedIdentity: { ids: sourceMemberIdSet(["Math.length"]) },
    resolve: (sourceMember) => mathPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)),
  },
  {
    identity: { prefixes: ["RegExp."] },
    excludedIdentity: { ids: sourceMemberIdSet(["RegExp.length"]) },
    resolve: (sourceMember) => regExpPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)),
  },
  {
    identity: { prefixes: ["Number."] },
    excludedIdentity: { ids: sourceMemberIdSet(["Number.length"]) },
    resolve: (sourceMember) => numberPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)),
  },
  {
    identity: { prefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."] },
    excludedIdentity: { ids: sourceMemberIdSet(["Map.length", "ReadonlyMap.length", "Set.length", "ReadonlySet.length"]) },
    resolve: getCollectionPropertyTargetMember,
  },
  {
    identity: { ids: sourceMemberIdSet(["String.length"]) },
    resolve: (sourceMember) => jsSurfaceTargetMemberFromMetadata({
      id: "tsonic.csharp.js.String.length",
      sourceName: sourceLibraryMemberName(sourceMember),
      targetName: "Length",
      kind: "property",
      returnType: csharpSourcePrimitiveTargetType("int32"),
    }),
  },
  {
    identity: { ids: sourceMemberIdSet(["Array.length", "ReadonlyArray.length"]) },
    resolve: (sourceMember, receiverType) => {
      const lengthMember = receiverType?.kind === "array"
        ? "length"
        : getCsharpArrayLengthMember(receiverType);
      return lengthMember === undefined
        ? undefined
        : jsSurfaceTargetMemberFromMetadata({
            id: `tsonic.csharp.js.${sourceLibraryMemberIdentity(sourceMember)}`,
            sourceName: sourceLibraryMemberName(sourceMember),
            targetName: lengthMember,
            kind: "property",
            returnType: csharpSourcePrimitiveTargetType("int32"),
          });
    },
  },
];

const propertyPrecheckRules: readonly CsharpJsPropertyPrecheckRule[] = [
  {
    identity: { prefixes: ["Console."] },
    result: () => "defer",
  },
  {
    identity: { prefixes: ["Object."] },
    result: (sourceMember) => hasObjectTargetMember(sourceLibraryMemberName(sourceMember)) ? "defer" : "reject-unmapped",
  },
  {
    identity: { prefixes: ["JSON."] },
    result: (sourceMember) => jsonTargetMembersForSourceName(sourceLibraryMemberName(sourceMember)).length > 0 ? "defer" : "reject-unmapped",
  },
];

function propertyMemberResolverApplies(resolver: CsharpJsPropertyMemberResolver, sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, resolver.identity) &&
    (resolver.excludedIdentity === undefined || !sourceLibraryMemberMatches(sourceMember, resolver.excludedIdentity));
}

function propertyPrecheckRuleApplies(rule: CsharpJsPropertyPrecheckRule, sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, rule.identity);
}

function sourceMemberIdSet(ids: Parameters<typeof sourceLibraryMemberIdSet>[0]): ReturnType<typeof sourceLibraryMemberIdSet> {
  return sourceLibraryMemberIdSet(ids);
}
