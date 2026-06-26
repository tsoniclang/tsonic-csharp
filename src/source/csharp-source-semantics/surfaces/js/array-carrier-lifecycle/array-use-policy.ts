import type {
  SourceLibraryMember,
  SourceLibraryMemberId,
} from "../source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberMatchesAny,
} from "../source-library.js";
import type {
  ArrayUse,
} from "./types.js";

export function classifySourceLibraryArrayPropertyUse(
  sourceMember: SourceLibraryMember,
  isWriteTarget: boolean,
): readonly ArrayUse[] {
  const propertyRule = arrayPropertyUseRules.find((rule) => arrayPropertyUseRuleApplies(rule, sourceMember));
  return propertyRule === undefined ? [] : propertyRule.uses(sourceMember, isWriteTarget);
}

export function classifySourceLibraryStaticCallArgumentUse(
  sourceMember: SourceLibraryMember,
  argumentIndex: number,
): readonly ArrayUse[] {
  const rule = staticCallArgumentUseRules.find((candidate) =>
    staticCallArgumentUseRuleApplies(candidate, sourceMember, argumentIndex)
  );
  return rule === undefined ? [] : rule.uses;
}

interface ArrayPropertyUseRule {
  readonly sourceMemberIds: ReadonlySet<SourceLibraryMemberId>;
  readonly uses: (sourceMember: SourceLibraryMember, isWriteTarget: boolean) => readonly ArrayUse[];
}

interface StaticCallArgumentUseRule {
  readonly sourceMemberIds: ReadonlySet<SourceLibraryMemberId>;
  readonly argumentIndex: StaticCallArgumentIndexPolicy;
  readonly uses: readonly ArrayUse[];
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
    sourceMemberIds: sourceMemberIdSet(["Array.length", "ReadonlyArray.length"]),
    uses: (_sourceMember, isWriteTarget) => isWriteTarget ? ["full-js"] : ["length-read"],
  },
  {
    sourceMemberIds: denseMutatingArrayMemberIds,
    uses: () => ["dense-mutation"],
  },
  {
    sourceMemberIds: fullJsArrayMemberIds,
    uses: () => ["full-js"],
  },
  {
    sourceMemberIds: readIndexableArrayMemberIds,
    uses: () => ["index-read"],
  },
];

const staticCallArgumentUseRules: readonly StaticCallArgumentUseRule[] = [
  {
    sourceMemberIds: sourceMemberIdSet(["Array.from"]),
    argumentIndex: 0,
    uses: ["sequential-read"],
  },
  {
    sourceMemberIds: sourceMemberIdSet(["Array.isArray"]),
    argumentIndex: 0,
    uses: ["index-read"],
  },
  {
    sourceMemberIds: sourceMemberIdSet(["Object.keys", "Object.values", "Object.entries"]),
    argumentIndex: 0,
    uses: ["full-js"],
  },
  {
    sourceMemberIds: sourceMemberIdSet(["Object.assign"]),
    argumentIndex: { greaterThan: 0 },
    uses: ["full-js"],
  },
];

function sourceMemberIdSet(ids: readonly SourceLibraryMemberId[]): ReadonlySet<SourceLibraryMemberId> {
  return sourceLibraryMemberIdSet(ids);
}

function arrayPropertyUseRuleApplies(rule: ArrayPropertyUseRule, sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatchesAny(sourceMember, rule.sourceMemberIds);
}

function staticCallArgumentUseRuleApplies(
  rule: StaticCallArgumentUseRule,
  sourceMember: SourceLibraryMember,
  argumentIndex: number,
): boolean {
  return sourceLibraryMemberMatchesAny(sourceMember, rule.sourceMemberIds) && argumentIndexMatchesPolicy(rule.argumentIndex, argumentIndex);
}

function argumentIndexMatchesPolicy(policy: StaticCallArgumentIndexPolicy, argumentIndex: number): boolean {
  return typeof policy === "number"
    ? argumentIndex === policy
    : argumentIndex > policy.greaterThan;
}
