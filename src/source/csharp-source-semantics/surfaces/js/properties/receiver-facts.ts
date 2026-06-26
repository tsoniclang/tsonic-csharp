import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
} from "../arrays.js";
import {
  isCsharpBooleanTargetType,
} from "../booleans.js";
import {
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "../collections.js";
import {
  isCsharpJsDateRuntimeCarrier,
} from "../date/index.js";
import {
  isCsharpJsRegExpRuntimeCarrier,
} from "../regexp/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../source-library.js";
import {
  sourceLibraryMemberMatches,
} from "../source-library.js";

export function csharpJsSourceLibraryPropertyRequiresSeededReceiverFacts(sourceMember: SourceLibraryMember): boolean {
  return propertyIdentityPolicyMatchesAny(sourceMember, seededReceiverFactPolicies);
}

export function csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection(sourceMember: SourceLibraryMember): boolean {
  return propertyIdentityPolicyMatchesAny(sourceMember, finalCarrierSelectionPolicies);
}

export function csharpJsSourceLibraryPropertyReceiverHasClosedFacts(
  receiverType: TargetTypeRef | undefined,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const policy = propertyReceiverValidatorPolicies.find((candidate) => sourceLibraryMemberMatches(sourceMember, candidate.identity));
  return propertyReceiverRequirementIsSatisfied(policy?.requirement, receiverType, host);
}

interface PropertyReceiverValidatorPolicy {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly requirement: PropertyReceiverRequirement;
}

type PropertyReceiverRequirement =
  | "always"
  | "array-like"
  | "string"
  | "regexp"
  | "date"
  | "boolean"
  | "number-static"
  | "map"
  | "set";

const seededReceiverFactPolicies: readonly SourceLibraryMemberIdentityPolicy[] = [
  { prefixes: ["Array.", "ReadonlyArray.", "Map.", "ReadonlyMap.", "Set.", "ReadonlySet."] },
];

const finalCarrierSelectionPolicies: readonly SourceLibraryMemberIdentityPolicy[] = [
  { prefixes: ["Array.", "ReadonlyArray."] },
];

const propertyReceiverValidatorPolicies: readonly PropertyReceiverValidatorPolicy[] = [
  { identity: { prefixes: ["Math."] }, requirement: "always" },
  { identity: { prefixes: ["Array.", "ReadonlyArray."] }, requirement: "array-like" },
  { identity: { prefixes: ["String."] }, requirement: "string" },
  { identity: { prefixes: ["RegExp."] }, requirement: "regexp" },
  { identity: { prefixes: ["Date."] }, requirement: "date" },
  { identity: { prefixes: ["Boolean."] }, requirement: "boolean" },
  { identity: { prefixes: ["Number."] }, requirement: "number-static" },
  { identity: { prefixes: ["Map.", "ReadonlyMap."] }, requirement: "map" },
  { identity: { prefixes: ["Set.", "ReadonlySet."] }, requirement: "set" },
];

function propertyReceiverRequirementIsSatisfied(
  requirement: PropertyReceiverRequirement | undefined,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  switch (requirement) {
    case "always":
      return true;
    case "array-like":
      return getCsharpArrayLikeElementType(receiverType) !== undefined;
    case "string":
      return host.isCsharpStringType(receiverType);
    case "regexp":
      return isCsharpJsRegExpRuntimeCarrier(receiverType);
    case "date":
      return isCsharpJsDateRuntimeCarrier(receiverType);
    case "boolean":
      return isCsharpBooleanTargetType(receiverType);
    case "number-static":
      return true;
    case "map":
      return isCsharpJsMapTargetType(receiverType);
    case "set":
      return isCsharpJsSetTargetType(receiverType);
    case undefined:
      return false;
  }
}

function propertyIdentityPolicyMatchesAny(
  sourceMember: SourceLibraryMember,
  policies: readonly SourceLibraryMemberIdentityPolicy[],
): boolean {
  return policies.some((policy) => sourceLibraryMemberMatches(sourceMember, policy));
}
