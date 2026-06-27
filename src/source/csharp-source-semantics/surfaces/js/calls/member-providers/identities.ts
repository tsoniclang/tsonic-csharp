import type {
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
  SourceLibraryMemberKey,
} from "../../source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberMatches,
} from "../../source-library.js";

export const collectionIdentityPolicy = {
  prefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
} satisfies SourceLibraryMemberIdentityPolicy;

export const arrayConstructorIdentityPolicy = {
  ids: sourceLibraryMemberIdSet(["Array.constructor"]),
} satisfies SourceLibraryMemberIdentityPolicy;

const arrayCallableMemberIds = [
  "Array.from",
  "Array.of",
  "Array.isArray",
  "Array.push",
  "Array.pop",
  "Array.shift",
  "Array.unshift",
  "Array.concat",
  "Array.at",
  "Array.includes",
  "Array.indexOf",
  "Array.lastIndexOf",
  "Array.join",
  "Array.slice",
  "Array.splice",
  "Array.reverse",
  "Array.fill",
  "Array.copyWithin",
  "Array.toReversed",
  "Array.toSorted",
  "Array.toSpliced",
  "Array.with",
  "Array.keys",
  "Array.values",
  "Array.entries",
  "Array.sort",
  "Array.forEach",
  "Array.some",
  "Array.every",
  "Array.filter",
  "Array.map",
  "Array.find",
  "Array.findIndex",
  "Array.findLast",
  "Array.findLastIndex",
  "ReadonlyArray.concat",
  "ReadonlyArray.at",
  "ReadonlyArray.includes",
  "ReadonlyArray.indexOf",
  "ReadonlyArray.lastIndexOf",
  "ReadonlyArray.join",
  "ReadonlyArray.slice",
  "ReadonlyArray.toReversed",
  "ReadonlyArray.toSorted",
  "ReadonlyArray.toSpliced",
  "ReadonlyArray.with",
  "ReadonlyArray.keys",
  "ReadonlyArray.values",
  "ReadonlyArray.entries",
  "ReadonlyArray.forEach",
  "ReadonlyArray.some",
  "ReadonlyArray.every",
  "ReadonlyArray.filter",
  "ReadonlyArray.map",
  "ReadonlyArray.find",
  "ReadonlyArray.findIndex",
  "ReadonlyArray.findLast",
  "ReadonlyArray.findLastIndex",
] as const satisfies readonly SourceLibraryMemberKey[];

export const arrayCallableIdentityPolicy = {
  ids: sourceLibraryMemberIdSet(arrayCallableMemberIds),
} satisfies SourceLibraryMemberIdentityPolicy;

export const collectionConstructorIdentityPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Map.constructor",
    "ReadonlyMap.constructor",
    "Set.constructor",
    "ReadonlySet.constructor",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const objectToStringIdentityPolicy = {
  ids: sourceLibraryMemberIdSet(["Object.toString"]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const objectRecordDictionaryIdentityPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Object.keys",
    "Object.values",
    "Object.entries",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

export function csharpJsSourceLibraryMemberIsArrayConstructor(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined &&
    sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy);
}

export function csharpJsSourceLibraryMemberIsCollection(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined && sourceLibraryMemberMatches(sourceMember, collectionIdentityPolicy);
}
