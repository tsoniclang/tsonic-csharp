import type {
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
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

export const arrayCallSurfaceMemberNames = new Set([
  "from",
  "of",
  "isArray",
  "push",
  "pop",
  "shift",
  "unshift",
  "concat",
  "at",
  "includes",
  "indexOf",
  "lastIndexOf",
  "join",
  "slice",
  "splice",
  "reverse",
  "sort",
  "forEach",
  "some",
  "every",
  "filter",
  "map",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
]);

export function csharpJsSourceLibraryMemberIsArrayConstructor(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined &&
    sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy);
}

export function csharpJsSourceLibraryMemberIsCollection(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined && sourceLibraryMemberMatches(sourceMember, collectionIdentityPolicy);
}
