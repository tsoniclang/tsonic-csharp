import type {
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";
import {
  sourceLibraryMemberIdSet,
} from "../../source-library.js";
import {
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
} from "../member-providers/index.js";

export const objectIdentityPolicy = { prefixes: ["Object."] } satisfies SourceLibraryMemberIdentityPolicy;

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

export {
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
};
