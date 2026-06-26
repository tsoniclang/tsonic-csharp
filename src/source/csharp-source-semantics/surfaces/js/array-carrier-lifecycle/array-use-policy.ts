import type {
  SourceLibraryMember,
} from "../source-library.js";
import type {
  ArrayUse,
} from "./types.js";

export function classifySourceLibraryArrayPropertyUse(
  sourceMember: SourceLibraryMember,
  isWriteTarget: boolean,
): readonly ArrayUse[] {
  const propertyRule = arrayPropertyUseRules.find((rule) => rule.matches(sourceMember));
  return propertyRule === undefined ? [] : propertyRule.uses(sourceMember, isWriteTarget);
}

export function classifySourceLibraryStaticCallArgumentUse(
  sourceMember: SourceLibraryMember,
  argumentIndex: number,
): readonly ArrayUse[] {
  const rule = staticCallArgumentUseRules.find((candidate) => candidate.matches(sourceMember, argumentIndex));
  return rule === undefined ? [] : rule.uses;
}

interface ArrayPropertyUseRule {
  readonly matches: (sourceMember: SourceLibraryMember) => boolean;
  readonly uses: (sourceMember: SourceLibraryMember, isWriteTarget: boolean) => readonly ArrayUse[];
}

interface StaticCallArgumentUseRule {
  readonly matches: (sourceMember: SourceLibraryMember, argumentIndex: number) => boolean;
  readonly uses: readonly ArrayUse[];
}

const arrayPropertyUseRules: readonly ArrayPropertyUseRule[] = [
  {
    matches: (sourceMember) => sourceMember.memberName === "length",
    uses: (_sourceMember, isWriteTarget) => isWriteTarget ? ["full-js"] : ["length-read"],
  },
  {
    matches: (sourceMember) => denseMutatingArrayMethods.has(sourceMember.memberName),
    uses: () => ["dense-mutation"],
  },
  {
    matches: (sourceMember) => fullJsArrayMethods.has(sourceMember.memberName),
    uses: () => ["full-js"],
  },
  {
    matches: (sourceMember) => readIndexableArrayMethods.has(sourceMember.memberName),
    uses: () => ["index-read"],
  },
];

const staticCallArgumentUseRules: readonly StaticCallArgumentUseRule[] = [
  {
    matches: (sourceMember, argumentIndex) =>
      sourceMember.declaringName === "Array" &&
      sourceMember.memberName === "from" &&
      argumentIndex === 0,
    uses: ["sequential-read"],
  },
  {
    matches: (sourceMember, argumentIndex) =>
      sourceMember.declaringName === "Array" &&
      sourceMember.memberName === "isArray" &&
      argumentIndex === 0,
    uses: ["index-read"],
  },
  {
    matches: (sourceMember, argumentIndex) =>
      sourceMember.declaringName === "Object" &&
      (sourceMember.memberName === "keys" || sourceMember.memberName === "values" || sourceMember.memberName === "entries") &&
      argumentIndex === 0,
    uses: ["full-js"],
  },
  {
    matches: (sourceMember, argumentIndex) =>
      sourceMember.declaringName === "Object" &&
      sourceMember.memberName === "assign" &&
      argumentIndex > 0,
    uses: ["full-js"],
  },
];

const denseMutatingArrayMethods = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "reverse",
  "sort",
]);

const readIndexableArrayMethods = new Set([
  "at",
  "concat",
  "every",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "forEach",
  "includes",
  "indexOf",
  "join",
  "lastIndexOf",
  "map",
  "reduce",
  "reduceRight",
  "slice",
  "some",
]);

const fullJsArrayMethods = new Set([
  "copyWithin",
  "fill",
  "flat",
  "flatMap",
  "toReversed",
  "toSorted",
  "toSpliced",
  "with",
]);
