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
  getRegExpPropertyTargetMember,
  isCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryDeclaringName,
  SourceLibraryMember,
  SourceLibraryMemberId,
  SourceLibraryMemberIdPrefix,
} from "./source-library.js";
import {
  createSourceLibraryMember,
  csharpSourcePrimitiveTargetType,
  sourceLibraryMemberIdSet,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatchesAny,
  sourceLibraryMemberMatchesAnyPrefix,
  sourceLibraryMemberName,
  targetProperty,
} from "./source-library.js";
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
  return sourceLibraryMemberMatchesAnyPrefix(sourceMember, seededReceiverFactSourceMemberIdPrefixes);
}

export function csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection(sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatchesAnyPrefix(sourceMember, finalCarrierSelectionSourceMemberIdPrefixes);
}

export function csharpJsSourceLibraryPropertyReceiverHasClosedFacts(
  receiverType: TargetTypeRef | undefined,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  return propertyReceiverValidatorPolicies
    .find((policy) => sourceLibraryMemberMatchesAnyPrefix(sourceMember, policy.sourceMemberIdPrefixes))
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
  readonly sourceMemberIdPrefixes?: readonly SourceLibraryMemberIdPrefix[];
  readonly sourceMemberIds?: ReadonlySet<SourceLibraryMemberId>;
  readonly excludedSourceMemberIds?: ReadonlySet<SourceLibraryMemberId>;
  readonly resolve: (sourceMember: SourceLibraryMember, receiverType: TargetTypeRef | undefined) => TargetMember | undefined;
}

interface CsharpJsPropertyPrecheckRule {
  readonly sourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[];
  readonly result: (sourceMember: SourceLibraryMember) => CsharpJsSourceLibraryPropertyPrecheck;
}

interface CsharpJsPropertyReceiverValidatorPolicy {
  readonly sourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[];
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

const seededReceiverFactSourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[] = [
  "Array.",
  "ReadonlyArray.",
  "Map.",
  "ReadonlyMap.",
  "Set.",
  "ReadonlySet.",
];

const finalCarrierSelectionSourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[] = [
  "Array.",
  "ReadonlyArray.",
];

const propertyReceiverValidatorPolicies: readonly CsharpJsPropertyReceiverValidatorPolicy[] = [
  { sourceMemberIdPrefixes: ["Math."], validate: () => true },
  { sourceMemberIdPrefixes: ["Array.", "ReadonlyArray."], validate: (receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined },
  { sourceMemberIdPrefixes: ["String."], validate: (receiverType, _sourceMember, host) => host.isCsharpStringType(receiverType) },
  { sourceMemberIdPrefixes: ["RegExp."], validate: (receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType) },
  { sourceMemberIdPrefixes: ["Date."], validate: (receiverType) => isCsharpJsDateRuntimeCarrier(receiverType) },
  { sourceMemberIdPrefixes: ["Boolean."], validate: (receiverType) => isCsharpBooleanTargetType(receiverType) },
  { sourceMemberIdPrefixes: ["Number."], validate: (_receiverType, sourceMember) => numberPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)) !== undefined },
  { sourceMemberIdPrefixes: ["Map.", "ReadonlyMap."], validate: (receiverType) => isCsharpJsMapTargetType(receiverType) },
  { sourceMemberIdPrefixes: ["Set.", "ReadonlySet."], validate: (receiverType) => isCsharpJsSetTargetType(receiverType) },
];

const propertyMemberResolvers: readonly CsharpJsPropertyMemberResolver[] = [
  {
    sourceMemberIdPrefixes: ["Math."],
    excludedSourceMemberIds: sourceMemberIdSet(["Math.length"]),
    resolve: (sourceMember) => mathPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)),
  },
  {
    sourceMemberIdPrefixes: ["RegExp."],
    excludedSourceMemberIds: sourceMemberIdSet(["RegExp.length"]),
    resolve: (sourceMember) => getRegExpPropertyTargetMember(sourceLibraryMemberName(sourceMember)),
  },
  {
    sourceMemberIdPrefixes: ["Number."],
    excludedSourceMemberIds: sourceMemberIdSet(["Number.length"]),
    resolve: (sourceMember) => numberPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)),
  },
  {
    sourceMemberIdPrefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
    excludedSourceMemberIds: sourceMemberIdSet(["Map.length", "ReadonlyMap.length", "Set.length", "ReadonlySet.length"]),
    resolve: getCollectionPropertyTargetMember,
  },
  {
    sourceMemberIds: sourceMemberIdSet(["String.length"]),
    resolve: (sourceMember) => targetProperty(
      "tsonic.csharp.js.String.length",
      sourceLibraryMemberName(sourceMember),
      "Length",
      csharpSourcePrimitiveTargetType("int32"),
    ),
  },
  {
    sourceMemberIds: sourceMemberIdSet(["Array.length", "ReadonlyArray.length"]),
    resolve: (sourceMember, receiverType) => {
      const lengthMember = receiverType?.kind === "array"
        ? "length"
        : getCsharpArrayLengthMember(receiverType);
      return lengthMember === undefined
        ? undefined
        : targetProperty(
            `tsonic.csharp.js.${sourceLibraryMemberIdentity(sourceMember)}`,
            sourceLibraryMemberName(sourceMember),
            lengthMember,
            csharpSourcePrimitiveTargetType("int32"),
          );
    },
  },
];

const propertyPrecheckRules: readonly CsharpJsPropertyPrecheckRule[] = [
  {
    sourceMemberIdPrefixes: ["Console."],
    result: () => "defer",
  },
  {
    sourceMemberIdPrefixes: ["Object."],
    result: (sourceMember) => hasObjectTargetMember(sourceLibraryMemberName(sourceMember)) ? "defer" : "reject-unmapped",
  },
  {
    sourceMemberIdPrefixes: ["JSON."],
    result: (sourceMember) => jsonTargetMembersForSourceName(sourceLibraryMemberName(sourceMember)).length > 0 ? "defer" : "reject-unmapped",
  },
];

function propertyMemberResolverApplies(resolver: CsharpJsPropertyMemberResolver, sourceMember: SourceLibraryMember): boolean {
  return (resolver.sourceMemberIds === undefined || sourceLibraryMemberMatchesAny(sourceMember, resolver.sourceMemberIds)) &&
    (resolver.sourceMemberIdPrefixes === undefined || sourceLibraryMemberMatchesAnyPrefix(sourceMember, resolver.sourceMemberIdPrefixes)) &&
    (resolver.excludedSourceMemberIds === undefined || !sourceLibraryMemberMatchesAny(sourceMember, resolver.excludedSourceMemberIds));
}

function propertyPrecheckRuleApplies(rule: CsharpJsPropertyPrecheckRule, sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatchesAnyPrefix(sourceMember, rule.sourceMemberIdPrefixes);
}

function sourceMemberIdSet(ids: readonly SourceLibraryMemberId[]): ReadonlySet<SourceLibraryMemberId> {
  return sourceLibraryMemberIdSet(ids);
}
