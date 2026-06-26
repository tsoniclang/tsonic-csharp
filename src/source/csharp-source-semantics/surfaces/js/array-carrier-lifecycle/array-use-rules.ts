import type {
  SourceLibraryMember,
  SourceLibraryMemberKey,
} from "../source-library.js";
import {
  sourceLibraryMemberIdSet,
} from "../source-library.js";
import type {
  CsharpArrayCarrierRequirement,
} from "./types.js";

export function getSourceLibraryArrayPropertyCarrierRequirements(
  sourceMember: SourceLibraryMember,
  isWriteTarget: boolean,
): readonly CsharpArrayCarrierRequirement[] {
  const propertyRule = propertyRequirementRowsBySourceIdentity.get(sourceMember.id);
  return propertyRule === undefined ? [] : isWriteTarget ? propertyRule.write ?? propertyRule.read : propertyRule.read;
}

export function sourceLibraryMemberHasArrayCarrierRequirementPolicy(sourceMember: SourceLibraryMember): boolean {
  return propertyRequirementRowsBySourceIdentity.has(sourceMember.id) ||
    staticArgumentRequirementRowsBySourceIdentity.has(sourceMember.id);
}

export function getSourceLibraryStaticCallArgumentCarrierRequirements(
  sourceMember: SourceLibraryMember,
  argumentIndex: number,
): readonly CsharpArrayCarrierRequirement[] {
  const rule = staticArgumentRequirementRowsBySourceIdentity.get(sourceMember.id)
    ?.find((candidate) => argumentIndexMatchesPolicy(candidate.argumentIndex, argumentIndex));
  return rule === undefined ? [] : rule.uses;
}

interface ArrayPropertyUseRule {
  readonly sourceId: SourceLibraryMemberKey;
  readonly read: readonly CsharpArrayCarrierRequirement[];
  readonly write?: readonly CsharpArrayCarrierRequirement[];
}

interface StaticCallArgumentUseRule {
  readonly sourceId: SourceLibraryMemberKey;
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

const propertyRequirementRows: readonly ArrayPropertyUseRule[] = [
  ...propertyRequirementRowsForIds(["Array.length", "ReadonlyArray.length"], ["length-read"], ["full-js"]),
  ...propertyRequirementRowsForIds([...denseMutatingArrayMemberIds], ["dense-mutation"]),
  ...propertyRequirementRowsForIds([...fullJsArrayMemberIds], ["full-js"]),
  ...propertyRequirementRowsForIds([...readIndexableArrayMemberIds], ["index-read"]),
];

const staticArgumentRequirementRows: readonly StaticCallArgumentUseRule[] = [
  staticArgumentRequirementRow("Array.from", 0, ["sequential-read"]),
  staticArgumentRequirementRow("Array.isArray", 0, ["index-read"]),
  staticArgumentRequirementRow("Object.keys", 0, ["full-js"]),
  staticArgumentRequirementRow("Object.values", 0, ["full-js"]),
  staticArgumentRequirementRow("Object.entries", 0, ["full-js"]),
  staticArgumentRequirementRow("Object.assign", { greaterThan: 0 }, ["full-js"]),
];

const propertyRequirementRowsBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, ArrayPropertyUseRule> =
  new Map(propertyRequirementRows.map((row) => [row.sourceId, row]));

const staticArgumentRequirementRowsBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly StaticCallArgumentUseRule[]> =
  staticArgumentRequirementIndex(staticArgumentRequirementRows);

function sourceMemberIdSet(ids: Parameters<typeof sourceLibraryMemberIdSet>[0]): ReturnType<typeof sourceLibraryMemberIdSet> {
  return sourceLibraryMemberIdSet(ids);
}

function propertyRequirementRowsForIds(
  sourceIds: readonly SourceLibraryMemberKey[],
  read: readonly CsharpArrayCarrierRequirement[],
  write?: readonly CsharpArrayCarrierRequirement[],
): readonly ArrayPropertyUseRule[] {
  return sourceIds.map((sourceId) => ({
    sourceId,
    read,
    ...(write === undefined ? {} : { write }),
  }));
}

function staticArgumentRequirementRow(
  sourceId: SourceLibraryMemberKey,
  argumentIndex: StaticCallArgumentIndexPolicy,
  uses: readonly CsharpArrayCarrierRequirement[],
): StaticCallArgumentUseRule {
  return {
    sourceId,
    argumentIndex,
    uses,
  };
}

function staticArgumentRequirementIndex(
  rows: readonly StaticCallArgumentUseRule[],
): ReadonlyMap<SourceLibraryMemberKey, readonly StaticCallArgumentUseRule[]> {
  const index = new Map<SourceLibraryMemberKey, StaticCallArgumentUseRule[]>();
  for (const row of rows) {
    const existing = index.get(row.sourceId);
    if (existing === undefined) {
      index.set(row.sourceId, [row]);
    } else {
      existing.push(row);
    }
  }
  return index;
}

function argumentIndexMatchesPolicy(policy: StaticCallArgumentIndexPolicy, argumentIndex: number): boolean {
  return typeof policy === "number"
    ? argumentIndex === policy
    : argumentIndex > policy.greaterThan;
}
