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
  numberPropertyTargetMemberForSourceName,
} from "../numbers.js";
import {
  isCsharpJsRegExpRuntimeCarrier,
} from "../regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../source-library.js";
import {
  sourceLibraryMemberMatches,
  sourceLibraryMemberName,
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
  return propertyReceiverValidatorPolicies
    .find((policy) => sourceLibraryMemberMatches(sourceMember, policy.identity))
    ?.validate(receiverType, sourceMember, host) ?? false;
}

interface CsharpJsPropertyReceiverValidatorPolicy {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly validate: (
    receiverType: TargetTypeRef | undefined,
    sourceMember: SourceLibraryMember,
    host: CsharpJsSurfaceHost,
  ) => boolean;
}

const seededReceiverFactPolicies: readonly SourceLibraryMemberIdentityPolicy[] = [
  { prefixes: ["Array.", "ReadonlyArray.", "Map.", "ReadonlyMap.", "Set.", "ReadonlySet."] },
];

const finalCarrierSelectionPolicies: readonly SourceLibraryMemberIdentityPolicy[] = [
  { prefixes: ["Array.", "ReadonlyArray."] },
];

const propertyReceiverValidatorPolicies: readonly CsharpJsPropertyReceiverValidatorPolicy[] = [
  { identity: { prefixes: ["Math."] }, validate: () => true },
  { identity: { prefixes: ["Array.", "ReadonlyArray."] }, validate: (receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined },
  { identity: { prefixes: ["String."] }, validate: (receiverType, _sourceMember, host) => host.isCsharpStringType(receiverType) },
  { identity: { prefixes: ["RegExp."] }, validate: (receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType) },
  { identity: { prefixes: ["Date."] }, validate: (receiverType) => isCsharpJsDateRuntimeCarrier(receiverType) },
  { identity: { prefixes: ["Boolean."] }, validate: (receiverType) => isCsharpBooleanTargetType(receiverType) },
  { identity: { prefixes: ["Number."] }, validate: (_receiverType, sourceMember) => numberPropertyTargetMemberForSourceName(sourceLibraryMemberName(sourceMember)) !== undefined },
  { identity: { prefixes: ["Map.", "ReadonlyMap."] }, validate: (receiverType) => isCsharpJsMapTargetType(receiverType) },
  { identity: { prefixes: ["Set.", "ReadonlySet."] }, validate: (receiverType) => isCsharpJsSetTargetType(receiverType) },
];

function propertyIdentityPolicyMatchesAny(
  sourceMember: SourceLibraryMember,
  policies: readonly SourceLibraryMemberIdentityPolicy[],
): boolean {
  return policies.some((policy) => sourceLibraryMemberMatches(sourceMember, policy));
}
