import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  isCsharpJsArrayCarrierTargetType,
} from "./arrays.js";
import {
  isCsharpBooleanTargetType,
} from "./booleans.js";
import {
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./collections.js";
import {
  isCsharpJsDateRuntimeCarrier,
} from "./date.js";
import {
  isCsharpJsJsonValueTargetType,
} from "./json.js";
import {
  isCsharpNumberTargetType,
  numberStaticCallRequiresNoReceiver,
} from "./numbers.js";
import {
  isCsharpJsObjectCarrierTargetType,
} from "./objects.js";
import {
  getCsharpJsRegExpRuntimeCarrierForSubject,
  isCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "./source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatches,
  sourceLibraryMemberMatchesAny,
  sourceLibraryMemberName,
} from "./source-library.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
  isStringKeyedRecordDictionaryTargetType,
  isNumericSourcePrimitive,
} from "./calls/helpers.js";
import {
  arrayConstructorSourceMemberIds,
  collectionConstructorSourceMemberIds,
  collectionIdentityPolicy,
  csharpJsSourceLibraryMemberHasCallableProvider,
  getCsharpJsSourceLibraryCallMembersFromProviders,
  mapCsharpJsSourceLibraryProviderCheckedCall,
} from "./calls/member-providers.js";

export {
  csharpJsSourceLibraryMemberIsArrayConstructor,
  csharpJsSourceLibraryMemberIsCollection,
} from "./calls/member-providers.js";

export function getCsharpJsSourceLibraryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ReturnType<typeof getCsharpJsSourceLibraryCallMembersFromProviders> {
  return getCsharpJsSourceLibraryCallMembersFromProviders(sourceMember, request, context, host);
}

export function csharpJsSourceLibraryMemberHasCallableTarget(
  sourceMember: SourceLibraryMember,
): boolean {
  return csharpJsSourceLibraryMemberHasCallableProvider(sourceMember);
}

export function mapCsharpJsSourceLibrarySpecialCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" },
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  return mapCsharpJsSourceLibraryProviderCheckedCall(request, context, sourceMember, host, options);
}

export function csharpJsSourceLibraryCallMayNeedFinalFacts(
  sourceMember: SourceLibraryMember,
  phase: "checking" | "finalization" | undefined,
): boolean {
  return phase !== "finalization" && sourceLibraryMemberMatchesAny(sourceMember, finalFactsSensitiveCallIds);
}

export function csharpJsSourceLibraryCallReceiverHasClosedFacts(
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

export function csharpJsSourceLibraryCallCanWaitForFinalizedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization" | undefined,
): boolean {
  if ((phase === "checking" || phase === undefined) && compilerContextCanRunLifecycleFinalization(context)) {
    return true;
  }
  if (sourceLibraryMemberMatches(sourceMember, objectIdentityPolicy)) {
    return (phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context))) &&
      sourceLibraryObjectCallCanWaitForFinalizedFacts(sourceMember);
  }
  if (sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(sourceMember)) {
    return phase !== "finalization" && compilerContextCanRunLifecycleFinalization(context);
  }
  if (sourceLibraryMemberMatchesAny(sourceMember, arrayConstructorSourceMemberIds)) {
    return phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context));
  }
  if (phase === "finalization" || !sourceLibraryMemberMatchesAny(sourceMember, jsonStringifySourceMemberIds)) {
    return false;
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return request.arguments.some((argument, index) => {
    const argumentType = argumentTypes[index];
    return context.facts.get(argument, runtimeCarrierFactKey) === undefined &&
      (argumentType === undefined || targetTypeIsOpaqueAny(argumentType));
  });
}

const objectIdentityPolicy = { prefixes: ["Object."] } satisfies SourceLibraryMemberIdentityPolicy;
const jsonIdentityPolicy = { prefixes: ["JSON."] } satisfies SourceLibraryMemberIdentityPolicy;
const arrayConcatSourceMemberIds = sourceLibraryMemberIdSet(["Array.concat"]);

const jsonStringifySourceMemberIds = sourceLibraryMemberIdSet([
  "JSON.stringify",
]);

const finalFactsSensitiveCallIds = sourceLibraryMemberIdSet([
  "JSON.stringify",
]);

type JsonClosedFactsValidator = (
  argumentTypes: readonly (TargetTypeRef | undefined)[],
  host: CsharpJsSurfaceHost,
) => boolean;

const jsonClosedFactsValidators: ReadonlyMap<string, JsonClosedFactsValidator> = new Map([
  ["JSON.parse", (argumentTypes, host) => host.isCsharpStringType(argumentTypes[0])],
  ["JSON.stringify", (argumentTypes, host) => isSupportedJsonValueTargetType(argumentTypes[0], host)],
]);

type ObjectClosedFactsValidator = (
  argumentTypes: readonly (TargetTypeRef | undefined)[],
  host: CsharpJsSurfaceHost,
) => boolean;

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

const callClosedReceiverPolicies: readonly CallReceiverClosedFactsPolicyEntry[] = [
  { identity: { prefixes: ["Array."] }, validate: (request, context, sourceMember, host) => {
    if (sourceLibraryMemberMatchesAny(sourceMember, arrayConcatSourceMemberIds) && getSourceLibraryCallArgumentTargetTypes(request, context, host).some((argumentType) => argumentType === undefined)) {
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
    sourceLibraryMemberMatchesAny(sourceMember, collectionConstructorSourceMemberIds) ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsMapTargetType(receiverType)) },
  { identity: { prefixes: ["Set.", "ReadonlySet."] }, validate: (request, context, sourceMember, host) =>
    sourceLibraryMemberMatchesAny(sourceMember, collectionConstructorSourceMemberIds) ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsSetTargetType(receiverType)) },
];

function sourceLibraryJsonCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return jsonClosedFactsValidators.get(sourceLibraryMemberIdentity(sourceMember))?.(argumentTypes, host) ?? false;
}

function isSupportedJsonValueTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      host.isCsharpStringType(type) ||
      isNumericSourcePrimitive(type) ||
      (type.kind === "source-primitive" && type.name === "bool") ||
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type) ||
      isCsharpJsJsonValueTargetType(type)
    );
}

function sourceLibraryObjectCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceLibraryMemberMatchesAny(sourceMember, objectHasOwnPropertySourceMemberIds)) {
    return getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsObjectCarrierTargetType(receiverType));
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return objectClosedFactsValidators.get(sourceLibraryMemberIdentity(sourceMember))?.(argumentTypes, host) ?? true;
}

function isSupportedObjectHelperSourceTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type) ||
      type.kind === "source-primitive" ||
      host.isCsharpStringType(type) ||
      isStringKeyedRecordDictionaryTargetType(type, host)
    );
}

function sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatchesAny(sourceMember, arrayStaticCallWithoutReceiverSourceMemberIds);
}

function sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatchesAny(sourceMember, dateStaticCallWithoutReceiverSourceMemberIds);
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

function compilerContextCanRunLifecycleFinalization(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return context.host !== undefined;
}

function sourceLibraryObjectCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceLibraryMemberMatchesAny(sourceMember, objectCallCanWaitForFinalizedFactsSourceMemberIds);
}

function sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceLibraryMemberMatches(sourceMember, collectionOrPrimitiveCallCanWaitForFinalizedFactsPolicy);
}

function targetTypeIsOpaqueAny(type: TargetTypeRef): boolean {
  return type.kind === "opaque" && type.id === "any";
}

const objectHasOwnPropertySourceMemberIds = sourceLibraryMemberIdSet(["Object.hasOwnProperty"]);

const arrayStaticCallWithoutReceiverSourceMemberIds = sourceLibraryMemberIdSet([
  "Array.constructor",
  "Array.from",
  "Array.of",
  "Array.isArray",
]);

const dateStaticCallWithoutReceiverSourceMemberIds = sourceLibraryMemberIdSet([
  "Date.constructor",
  "Date.now",
  "Date.parse",
  "Date.UTC",
]);

const objectCallCanWaitForFinalizedFactsSourceMemberIds = sourceLibraryMemberIdSet([
  "Object.keys",
  "Object.values",
  "Object.entries",
  "Object.hasOwn",
  "Object.assign",
  "Object.toString",
]);

const collectionOrPrimitiveCallCanWaitForFinalizedFactsPolicy = {
  prefixes: ["Boolean.", "Number.", "Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
} satisfies SourceLibraryMemberIdentityPolicy;

interface ClosedReceiverRequirementPolicy {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly requiresClosedReceiver: (sourceMember: SourceLibraryMember) => boolean;
}

const closedReceiverRequirementPolicies: readonly ClosedReceiverRequirementPolicy[] = [
  {
    identity: { prefixes: ["Array."] },
    requiresClosedReceiver: (sourceMember) => !sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember),
  },
  { identity: { prefixes: ["ReadonlyArray."] }, requiresClosedReceiver: () => true },
  {
    identity: { prefixes: ["String."] },
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatchesAny(sourceMember, stringStaticCallWithoutReceiverSourceMemberIds),
  },
  {
    identity: { prefixes: ["Number."] },
    requiresClosedReceiver: (sourceMember) => !numberStaticCallRequiresNoReceiver(sourceLibraryMemberName(sourceMember)),
  },
  { identity: { prefixes: ["Boolean."] }, requiresClosedReceiver: () => true },
  {
    identity: { prefixes: ["RegExp."] },
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatchesAny(sourceMember, regexpConstructorSourceMemberIds),
  },
  {
    identity: { prefixes: ["Date."] },
    requiresClosedReceiver: (sourceMember) => !sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember),
  },
  {
    identity: { prefixes: ["Object."] },
    requiresClosedReceiver: (sourceMember) => sourceLibraryMemberMatchesAny(sourceMember, objectHasOwnPropertySourceMemberIds),
  },
  {
    identity: collectionIdentityPolicy,
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatchesAny(sourceMember, collectionConstructorSourceMemberIds),
  },
];

const stringStaticCallWithoutReceiverSourceMemberIds = sourceLibraryMemberIdSet([
  "String.fromCharCode",
  "String.fromCodePoint",
]);

const regexpConstructorSourceMemberIds = sourceLibraryMemberIdSet(["RegExp.constructor"]);
