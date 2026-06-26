import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
} from "../../arrays.js";
import {
  isCsharpBooleanTargetType,
} from "../../booleans.js";
import {
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "../../collections.js";
import {
  isCsharpJsDateRuntimeCarrier,
} from "../../date/index.js";
import {
  isCsharpNumberTargetType,
} from "../../numbers.js";
import {
  isCsharpJsObjectCarrierTargetType,
} from "../../objects.js";
import {
  getCsharpJsRegExpRuntimeCarrierForSubject,
  isCsharpJsRegExpRuntimeCarrier,
} from "../../regexp/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";
import {
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatches,
} from "../../source-library.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
} from "../helpers.js";
import {
  arrayConcatSourceMemberPolicy,
  collectionConstructorIdentityPolicy,
  closedReceiverRequirementPolicies,
  jsonIdentityPolicy,
  objectHasOwnPropertyPolicy,
  objectIdentityPolicy,
  sourceLibraryArrayStaticCallRequiresNoReceiver,
  sourceLibraryDateStaticCallRequiresNoReceiver,
} from "./identity-policies.js";
import {
  isSupportedJsonValueTargetType,
  isSupportedObjectHelperSourceTargetType,
} from "./target-type-support.js";

type JsonClosedFactsValidator = (
  argumentTypes: readonly (TargetTypeRef | undefined)[],
  host: CsharpJsSurfaceHost,
) => boolean;

type ObjectClosedFactsValidator = (
  argumentTypes: readonly (TargetTypeRef | undefined)[],
  host: CsharpJsSurfaceHost,
) => boolean;

type CallReceiverClosedFactsPolicy = (
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
) => boolean;

interface CallReceiverClosedFactsPolicyEntry {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly validate: CallReceiverClosedFactsPolicy;
}

const jsonClosedFactsValidators: ReadonlyMap<string, JsonClosedFactsValidator> = new Map([
  ["JSON.parse", (argumentTypes, host) => host.isCsharpStringType(argumentTypes[0])],
  ["JSON.stringify", (argumentTypes, host) => isSupportedJsonValueTargetType(argumentTypes[0], host)],
]);

const objectClosedFactsValidators: ReadonlyMap<string, ObjectClosedFactsValidator> = new Map([
  ["Object.keys", (argumentTypes, host) => isSupportedObjectHelperSourceTargetType(argumentTypes[0], host)],
  ["Object.values", (argumentTypes, host) => isSupportedObjectHelperSourceTargetType(argumentTypes[0], host)],
  ["Object.entries", (argumentTypes, host) => isSupportedObjectHelperSourceTargetType(argumentTypes[0], host)],
  ["Object.hasOwn", (argumentTypes, host) =>
    isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
      host.isCsharpStringType(argumentTypes[1])],
  ["Object.assign", (argumentTypes, host) =>
    isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
      argumentTypes.slice(1).every((argumentType) => isSupportedObjectHelperSourceTargetType(argumentType, host))],
]);

const callClosedReceiverPolicies: readonly CallReceiverClosedFactsPolicyEntry[] = [
  { identity: { prefixes: ["Array."] }, validate: (request, context, sourceMember, host) => {
    if (sourceLibraryMemberMatches(sourceMember, arrayConcatSourceMemberPolicy) && getSourceLibraryCallArgumentTargetTypes(request, context, host).some((argumentType) => argumentType === undefined)) {
      return false;
    }
    return sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember) ||
      getSourceLibraryCallReceiverTargetTypes(request, context, host)
        .some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined);
  } },
  { identity: { prefixes: ["ReadonlyArray."] }, validate: (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined) },
  { identity: { prefixes: ["String."] }, validate: (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => host.isCsharpStringType(receiverType)) },
  { identity: { prefixes: ["Number."] }, validate: (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpNumberTargetType(receiverType)) },
  { identity: { prefixes: ["Boolean."] }, validate: (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpBooleanTargetType(receiverType)) },
  { identity: { prefixes: ["RegExp."] }, validate: (request, context, _sourceMember, host) => {
    const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
    return receiverTypes.some((receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType)) ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiver, context) !== undefined ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverSymbol, context) !== undefined ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverResolvedSymbol, context) !== undefined;
  } },
  { identity: { prefixes: ["Date."] }, validate: (request, context, sourceMember, host) =>
    sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember) ||
    request.sourceSelectedDeclaration !== undefined ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsDateRuntimeCarrier(receiverType)) },
  { identity: { prefixes: ["Map.", "ReadonlyMap."] }, validate: (request, context, sourceMember, host) =>
    sourceLibraryMemberMatches(sourceMember, collectionConstructorIdentityPolicy) ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsMapTargetType(receiverType)) },
  { identity: { prefixes: ["Set.", "ReadonlySet."] }, validate: (request, context, sourceMember, host) =>
    sourceLibraryMemberMatches(sourceMember, collectionConstructorIdentityPolicy) ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsSetTargetType(receiverType)) },
];

export function sourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceLibraryMemberMatches(sourceMember, objectIdentityPolicy)) {
    return sourceLibraryObjectCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (sourceLibraryMemberMatches(sourceMember, jsonIdentityPolicy)) {
    return sourceLibraryJsonCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (!csharpJsSourceLibraryCallRequiresClosedReceiver(sourceMember)) {
    return true;
  }
  return callClosedReceiverPolicies
    .find((policy) => sourceLibraryMemberMatches(sourceMember, policy.identity))
    ?.validate(request, context, sourceMember, host) ?? true;
}

function sourceLibraryJsonCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return jsonClosedFactsValidators.get(sourceLibraryMemberIdentity(sourceMember))?.(argumentTypes, host) ?? false;
}

function sourceLibraryObjectCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceLibraryMemberMatches(sourceMember, objectHasOwnPropertyPolicy)) {
    return getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsObjectCarrierTargetType(receiverType));
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return objectClosedFactsValidators.get(sourceLibraryMemberIdentity(sourceMember))?.(argumentTypes, host) ?? true;
}

function csharpJsSourceLibraryCallRequiresClosedReceiver(sourceMember: SourceLibraryMember): boolean {
  const policy = closedReceiverRequirementPolicies.find((candidate) =>
    sourceLibraryMemberMatches(sourceMember, candidate.identity)
  );
  if (policy === undefined) {
    return false;
  }
  return policy.requiresClosedReceiver(sourceMember);
}
