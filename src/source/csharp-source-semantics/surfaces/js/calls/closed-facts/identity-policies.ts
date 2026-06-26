import type {
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberMatches,
  sourceLibraryMemberName,
} from "../../source-library.js";
import {
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
  collectionIdentityPolicy,
} from "../member-providers/index.js";
import {
  numberStaticCallRequiresNoReceiver,
} from "../../numbers.js";

export const objectIdentityPolicy = { prefixes: ["Object."] } satisfies SourceLibraryMemberIdentityPolicy;
export const jsonIdentityPolicy = { prefixes: ["JSON."] } satisfies SourceLibraryMemberIdentityPolicy;

export const objectHasOwnPropertyPolicy = {
  ids: sourceLibraryMemberIdSet(["Object.hasOwnProperty"]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const arrayStaticCallWithoutReceiverPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Array.constructor",
    "Array.from",
    "Array.of",
    "Array.isArray",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const dateStaticCallWithoutReceiverPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Date.constructor",
    "Date.now",
    "Date.parse",
    "Date.UTC",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const objectCallCanWaitForFinalizedFactsPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Object.keys",
    "Object.values",
    "Object.entries",
    "Object.hasOwn",
    "Object.assign",
    "Object.toString",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const collectionOrPrimitiveCallCanWaitForFinalizedFactsPolicy = {
  prefixes: ["Boolean.", "Number.", "Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
} satisfies SourceLibraryMemberIdentityPolicy;

export const stringStaticCallWithoutReceiverPolicy = {
  ids: sourceLibraryMemberIdSet([
    "String.fromCharCode",
    "String.fromCodePoint",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const regexpConstructorPolicy = {
  ids: sourceLibraryMemberIdSet(["RegExp.constructor"]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const arrayConcatSourceMemberPolicy = {
  ids: sourceLibraryMemberIdSet(["Array.concat"]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const jsonStringifySourceMemberPolicy = {
  ids: sourceLibraryMemberIdSet(["JSON.stringify"]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const finalFactsSensitiveCallPolicy = jsonStringifySourceMemberPolicy;

export function sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, arrayStaticCallWithoutReceiverPolicy);
}

export function sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, dateStaticCallWithoutReceiverPolicy);
}

export interface ClosedReceiverRequirementPolicy {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly requiresClosedReceiver: (sourceMember: SourceLibraryMember) => boolean;
}

export const closedReceiverRequirementPolicies: readonly ClosedReceiverRequirementPolicy[] = [
  {
    identity: { prefixes: ["Array."] },
    requiresClosedReceiver: (sourceMember) => !sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember),
  },
  { identity: { prefixes: ["ReadonlyArray."] }, requiresClosedReceiver: () => true },
  {
    identity: { prefixes: ["String."] },
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatches(sourceMember, stringStaticCallWithoutReceiverPolicy),
  },
  {
    identity: { prefixes: ["Number."] },
    requiresClosedReceiver: (sourceMember) => !numberStaticCallRequiresNoReceiver(sourceLibraryMemberName(sourceMember)),
  },
  { identity: { prefixes: ["Boolean."] }, requiresClosedReceiver: () => true },
  {
    identity: { prefixes: ["RegExp."] },
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatches(sourceMember, regexpConstructorPolicy),
  },
  {
    identity: { prefixes: ["Date."] },
    requiresClosedReceiver: (sourceMember) => !sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember),
  },
  {
    identity: { prefixes: ["Object."] },
    requiresClosedReceiver: (sourceMember) => sourceLibraryMemberMatches(sourceMember, objectHasOwnPropertyPolicy),
  },
  {
    identity: collectionIdentityPolicy,
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatches(sourceMember, collectionConstructorIdentityPolicy),
  },
];

export {
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
};
