import type {
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLengthMember,
  getCsharpArrayLikeElementType,
} from "./arrays.js";
import {
  isCsharpBooleanTargetType,
} from "./booleans.js";
import {
  getCollectionPropertyTargetMember,
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./collections.js";
import {
  isCsharpJsDateRuntimeCarrier,
} from "./date.js";
import {
  mathPropertyTargetMemberForSourceName,
} from "./math.js";
import {
  jsonTargetMembersForSourceName,
} from "./json.js";
import {
  numberPropertyTargetMemberForSourceName,
} from "./numbers.js";
import {
  hasObjectTargetMember,
} from "./objects.js";
import {
  isCsharpJsRegExpRuntimeCarrier,
  regExpPropertyTargetMemberForSourceName,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryDeclaringName,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "./source-library.js";
import {
  createSourceLibraryMember,
  csharpSourcePrimitiveTargetType,
  sourceLibraryMemberMatches,
  sourceLibraryMemberIdSet,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberName,
} from "./source-library.js";
import {
  jsSurfaceTargetMemberFromMetadata,
} from "./target-member-metadata.js";
import {
  getSourceStandardLibraryDeclaringNameForType,
} from "../../source-type-classification.js";

export function getCsharpJsSourceLibraryMemberFromReceiverType(
  receiverType: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getTypeAtLocation"]>,
  memberName: string,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  if (receiverType === undefined || memberName.length === 0) {
    return undefined;
  }
  const declaringName = getSourceStandardLibraryDeclaringNameForType(receiverType, context);
  return declaringName === undefined || !propertyReceiverSourceTypeNames.has(declaringName)
    ? undefined
    : createSourceLibraryMember(declaringName, memberName);
}

export function csharpJsSourceLibraryPropertyRequiresSeededReceiverFacts(sourceMember: SourceLibraryMember): boolean {
  return propertyIdentityPolicyMatchesAny(sourceMember, seededReceiverFactPolicies);
}

export function csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection(sourceMember: SourceLibraryMember): boolean {
  return propertyIdentityPolicyMatchesAny(sourceMember, finalCarrierSelectionPolicies);
}

export function csharpJsSourceLibraryPropertyReceiverHasClosedFacts(
  receiverType: TargetTypeRef | undefined,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  return propertyReceiverValidatorPolicies
    .find((policy) => sourceLibraryMemberMatches(sourceMember, policy.identity))
    ?.validate(receiverType, sourceMember, host) ?? false;
}

export function getCsharpJsSourceLibraryPropertyMember(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
): TargetMember | undefined {
  return propertyMemberResolvers
    .find((resolver) => propertyMemberResolverApplies(resolver, sourceMember))
    ?.resolve(sourceMember, receiverType);
}

export type CsharpJsSourceLibraryPropertyPrecheck = "continue" | "defer" | "reject-unmapped";

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

interface CsharpJsPropertyReceiverValidatorPolicy {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly validate: (
    receiverType: TargetTypeRef | undefined,
    sourceMember: SourceLibraryMember,
    host: CsharpJsSurfaceHost,
  ) => boolean;
}

const propertyReceiverSourceTypeNames = new Set<SourceLibraryDeclaringName>([
  "Array",
  "ReadonlyArray",
  "String",
  "Boolean",
  "RegExp",
  "Date",
  "Map",
  "ReadonlyMap",
  "Set",
  "ReadonlySet",
]);

const seededReceiverFactPolicies: readonly SourceLibraryMemberIdentityPolicy[] = [
  { prefixes: ["Array.", "ReadonlyArray.", "Map.", "ReadonlyMap.", "Set.", "ReadonlySet."] },
];

const finalCarrierSelectionPolicies: readonly SourceLibraryMemberIdentityPolicy[] = [
  { prefixes: ["Array.", "ReadonlyArray."] },
];

const propertyReceiverValidatorPolicies: readonly CsharpJsPropertyReceiverValidatorPolicy[] = [
  { identity: { prefixes: ["Math."] }, validate: () => true },
  { identity: { prefixes: ["Array.", "ReadonlyArray."] }, validate: (receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined },
  { identity: { prefixes: ["String."] }, validate: (receiverType, _sourceMember, host) => host.isCsharpStringType(receiverType) },
  { identity: { prefixes: ["RegExp."] }, validate: (receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType) },
  { identity: { prefixes: ["Date."] }, validate: (receiverType) => isCsharpJsDateRuntimeCarrier(receiverType) },
  { identity: { prefixes: ["Boolean."] }, validate: (receiverType) => isCsharpBooleanTargetType(receiverType) },
  { identity: { prefixes: ["Number."] }, validate: (_receiverType, sourceMember) => numberPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)) !== undefined },
  { identity: { prefixes: ["Map.", "ReadonlyMap."] }, validate: (receiverType) => isCsharpJsMapTargetType(receiverType) },
  { identity: { prefixes: ["Set.", "ReadonlySet."] }, validate: (receiverType) => isCsharpJsSetTargetType(receiverType) },
];

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

function propertyIdentityPolicyMatchesAny(
  sourceMember: SourceLibraryMember,
  policies: readonly SourceLibraryMemberIdentityPolicy[],
): boolean {
  return policies.some((policy) => sourceLibraryMemberMatches(sourceMember, policy));
}

function sourceMemberIdSet(ids: Parameters<typeof sourceLibraryMemberIdSet>[0]): ReturnType<typeof sourceLibraryMemberIdSet> {
  return sourceLibraryMemberIdSet(ids);
}
