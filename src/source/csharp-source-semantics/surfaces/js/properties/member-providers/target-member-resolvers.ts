import {
  mathPropertyTargetMemberForSourceName,
} from "../../math.js";
import {
  numberPropertyTargetMemberForSourceName,
} from "../../numbers.js";
import {
  regExpPropertyTargetMemberForSourceName,
} from "../../regexp/index.js";
import {
  csharpSourcePrimitiveTargetType,
  sourceLibraryMemberIdSet,
} from "../../source-library.js";
import type {
  CsharpJsPropertyMemberProvider,
  CsharpJsPropertyTargetMemberSet,
} from "./types.js";

const mathPropertyMemberSet = singleTargetMemberSet(mathPropertyTargetMemberForSourceName);
const regExpPropertyMemberSet = singleTargetMemberSet(regExpPropertyTargetMemberForSourceName);
const numberPropertyMemberSet = singleTargetMemberSet(numberPropertyTargetMemberForSourceName);

export const propertyMemberProviders: readonly CsharpJsPropertyMemberProvider[] = [
  {
    identity: { prefixes: ["Math."] },
    excludedIdentity: { ids: sourceLibraryMemberIdSet(["Math.length"]) },
    member: { kind: "metadata-by-source-name", members: mathPropertyMemberSet },
  },
  {
    identity: { prefixes: ["RegExp."] },
    excludedIdentity: { ids: sourceLibraryMemberIdSet(["RegExp.length"]) },
    member: { kind: "metadata-by-source-name", members: regExpPropertyMemberSet },
  },
  {
    identity: { prefixes: ["Number."] },
    excludedIdentity: { ids: sourceLibraryMemberIdSet(["Number.length"]) },
    member: { kind: "metadata-by-source-name", members: numberPropertyMemberSet },
  },
  {
    identity: { prefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."] },
    excludedIdentity: { ids: sourceLibraryMemberIdSet(["Map.length", "ReadonlyMap.length", "Set.length", "ReadonlySet.length"]) },
    member: { kind: "collection-size" },
  },
  {
    identity: { ids: sourceLibraryMemberIdSet(["String.length"]) },
    member: { kind: "string-length" },
  },
  {
    identity: { ids: sourceLibraryMemberIdSet(["Array.length", "ReadonlyArray.length"]) },
    member: { kind: "array-length" },
  },
];

export const int32PropertyReturnType = csharpSourcePrimitiveTargetType("int32");

function singleTargetMemberSet(
  get: (sourceName: string) => ReturnType<CsharpJsPropertyTargetMemberSet["get"]>[number] | undefined,
): CsharpJsPropertyTargetMemberSet {
  return {
    get: (sourceName) => {
      const member = get(sourceName);
      return member === undefined ? [] : [member];
    },
  };
}
