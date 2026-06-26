import type {
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberMatches,
} from "../source-library.js";
import type {
  CsharpArrayCarrierRequirement,
} from "./types.js";

export function getSourceLibraryArrayPropertyCarrierRequirements(
  sourceMember: SourceLibraryMember,
  isWriteTarget: boolean,
): readonly CsharpArrayCarrierRequirement[] {
  const propertyRule = arrayPropertyUseRules.find((rule) => arrayPropertyUseRuleApplies(rule, sourceMember));
  return propertyRule === undefined ? [] : propertyRule.uses(sourceMember, isWriteTarget);
}

export function sourceLibraryMemberHasArrayCarrierRequirementPolicy(sourceMember: SourceLibraryMember): boolean {
  return arrayPropertyUseRules.some((rule) => arrayUseRuleApplies(rule, sourceMember)) ||
    staticCallArgumentUseRules.some((rule) => arrayUseRuleApplies(rule, sourceMember));
}

export function getSourceLibraryStaticCallArgumentCarrierRequirements(
  sourceMember: SourceLibraryMember,
  argumentIndex: number,
): readonly CsharpArrayCarrierRequirement[] {
  const rule = staticCallArgumentUseRules.find((candidate) =>
    staticCallArgumentUseRuleApplies(candidate, sourceMember, argumentIndex)
  );
  return rule === undefined ? [] : rule.uses;
}

interface ArrayPropertyUseRule {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly uses: (sourceMember: SourceLibraryMember, isWriteTarget: boolean) => readonly CsharpArrayCarrierRequirement[];
}

interface StaticCallArgumentUseRule {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly argumentIndex: StaticCallArgumentIndexPolicy;
  readonly uses: readonly CsharpArrayCarrierRequirement[];
}

type StaticCallArgumentIndexPolicy = number | { readonly greaterThan: number };

const denseMutatingArrayMemberIds = sourceMemberIdSet([
  "Array.push",
  "Array.pop",
  "Array.shift",
  "Array.unshift",
  "Array.splice",
  "Array.reverse",
  "Array.sort",
]);

const readIndexableArrayMemberIds = sourceMemberIdSet([
  "Array.at",
  "Array.concat",
  "Array.every",
  "Array.filter",
  "Array.find",
  "Array.findIndex",
  "Array.findLast",
  "Array.findLastIndex",
  "Array.forEach",
  "Array.includes",
  "Array.indexOf",
  "Array.join",
  "Array.lastIndexOf",
  "Array.map",
  "Array.reduce",
  "Array.reduceRight",
  "Array.slice",
  "Array.some",
  "ReadonlyArray.at",
  "ReadonlyArray.concat",
  "ReadonlyArray.every",
  "ReadonlyArray.filter",
  "ReadonlyArray.find",
  "ReadonlyArray.findIndex",
  "ReadonlyArray.findLast",
  "ReadonlyArray.findLastIndex",
  "ReadonlyArray.forEach",
  "ReadonlyArray.includes",
  "ReadonlyArray.indexOf",
  "ReadonlyArray.join",
  "ReadonlyArray.lastIndexOf",
  "ReadonlyArray.map",
  "ReadonlyArray.reduce",
  "ReadonlyArray.reduceRight",
  "ReadonlyArray.slice",
  "ReadonlyArray.some",
]);

const fullJsArrayMemberIds = sourceMemberIdSet([
  "Array.copyWithin",
  "Array.fill",
  "Array.flat",
  "Array.flatMap",
  "Array.toReversed",
  "Array.toSorted",
  "Array.toSpliced",
  "Array.with",
]);

const arrayPropertyUseRules: readonly ArrayPropertyUseRule[] = [
  {
    identity: { ids: sourceMemberIdSet(["Array.length", "ReadonlyArray.length"]) },
    uses: (_sourceMember, isWriteTarget) => isWriteTarget ? ["full-js"] : ["length-read"],
  },
  {
    identity: { ids: denseMutatingArrayMemberIds },
    uses: () => ["dense-mutation"],
  },
  {
    identity: { ids: fullJsArrayMemberIds },
    uses: () => ["full-js"],
  },
  {
    identity: { ids: readIndexableArrayMemberIds },
    uses: () => ["index-read"],
  },
];

const staticCallArgumentUseRules: readonly StaticCallArgumentUseRule[] = [
  {
    identity: { ids: sourceMemberIdSet(["Array.from"]) },
    argumentIndex: 0,
    uses: ["sequential-read"],
  },
  {
    identity: { ids: sourceMemberIdSet(["Array.isArray"]) },
    argumentIndex: 0,
    uses: ["index-read"],
  },
  {
    identity: { ids: sourceMemberIdSet(["Object.keys", "Object.values", "Object.entries"]) },
    argumentIndex: 0,
    uses: ["full-js"],
  },
  {
    identity: { ids: sourceMemberIdSet(["Object.assign"]) },
    argumentIndex: { greaterThan: 0 },
    uses: ["full-js"],
  },
];

function sourceMemberIdSet(ids: Parameters<typeof sourceLibraryMemberIdSet>[0]): ReturnType<typeof sourceLibraryMemberIdSet> {
  return sourceLibraryMemberIdSet(ids);
}

function arrayPropertyUseRuleApplies(rule: ArrayPropertyUseRule, sourceMember: SourceLibraryMember): boolean {
  return arrayUseRuleApplies(rule, sourceMember);
}

function staticCallArgumentUseRuleApplies(
  rule: StaticCallArgumentUseRule,
  sourceMember: SourceLibraryMember,
  argumentIndex: number,
): boolean {
  return arrayUseRuleApplies(rule, sourceMember) && argumentIndexMatchesPolicy(rule.argumentIndex, argumentIndex);
}

function arrayUseRuleApplies(
  rule: Pick<ArrayPropertyUseRule | StaticCallArgumentUseRule, "identity">,
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceLibraryMemberMatches(sourceMember, rule.identity);
}

function argumentIndexMatchesPolicy(policy: StaticCallArgumentIndexPolicy, argumentIndex: number): boolean {
  return typeof policy === "number"
    ? argumentIndex === policy
    : argumentIndex > policy.greaterThan;
}
