import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  isCsharpJsArrayCarrierTargetType,
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
} from "../date.js";
import {
  isCsharpJsJsonValueTargetType,
} from "../json.js";
import {
  isCsharpNumberTargetType,
  numberStaticCallRequiresNoReceiver,
} from "../numbers.js";
import {
  isCsharpJsObjectCarrierTargetType,
} from "../objects.js";
import {
  getCsharpJsRegExpRuntimeCarrierForSubject,
  isCsharpJsRegExpRuntimeCarrier,
} from "../regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatches,
  sourceLibraryMemberName,
} from "../source-library.js";
import {
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
  collectionIdentityPolicy,
} from "./member-providers.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
  isNumericSourcePrimitive,
  isStringKeyedRecordDictionaryTargetType,
} from "./helpers.js";

export function csharpJsSourceLibraryCallMayNeedFinalFacts(
  sourceMember: SourceLibraryMember,
  phase: "checking" | "finalization" | undefined,
): boolean {
  return phase !== "finalization" && sourceLibraryMemberMatches(sourceMember, finalFactsSensitiveCallPolicy);
}

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
  if (sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy)) {
    return phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context));
  }
  if (phase === "finalization" || !sourceLibraryMemberMatches(sourceMember, jsonStringifySourceMemberPolicy)) {
    return false;
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  return request.arguments.some((argument, index) => {
    const argumentType = argumentTypes[index];
    return context.facts.get(argument, runtimeCarrierFactKey) === undefined &&
      (argumentType === undefined || targetTypeIsOpaqueAny(argumentType));
  });
}

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

interface ClosedReceiverRequirementPolicy {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly requiresClosedReceiver: (sourceMember: SourceLibraryMember) => boolean;
}

const objectIdentityPolicy = { prefixes: ["Object."] } satisfies SourceLibraryMemberIdentityPolicy;
const jsonIdentityPolicy = { prefixes: ["JSON."] } satisfies SourceLibraryMemberIdentityPolicy;
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

const closedReceiverRequirementPolicies: readonly ClosedReceiverRequirementPolicy[] = [
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
  if (sourceLibraryMemberMatches(sourceMember, objectHasOwnPropertyPolicy)) {
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
  return sourceLibraryMemberMatches(sourceMember, arrayStaticCallWithoutReceiverPolicy);
}

function sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceLibraryMemberMatches(sourceMember, dateStaticCallWithoutReceiverPolicy);
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
  return sourceLibraryMemberMatches(sourceMember, objectCallCanWaitForFinalizedFactsPolicy);
}

function sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceLibraryMemberMatches(sourceMember, collectionOrPrimitiveCallCanWaitForFinalizedFactsPolicy);
}

function targetTypeIsOpaqueAny(type: TargetTypeRef): boolean {
  return type.kind === "opaque" && type.id === "any";
}

const objectHasOwnPropertyPolicy = {
  ids: sourceLibraryMemberIdSet(["Object.hasOwnProperty"]),
} satisfies SourceLibraryMemberIdentityPolicy;

const arrayStaticCallWithoutReceiverPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Array.constructor",
    "Array.from",
    "Array.of",
    "Array.isArray",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

const dateStaticCallWithoutReceiverPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Date.constructor",
    "Date.now",
    "Date.parse",
    "Date.UTC",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

const objectCallCanWaitForFinalizedFactsPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Object.keys",
    "Object.values",
    "Object.entries",
    "Object.hasOwn",
    "Object.assign",
    "Object.toString",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

const collectionOrPrimitiveCallCanWaitForFinalizedFactsPolicy = {
  prefixes: ["Boolean.", "Number.", "Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
} satisfies SourceLibraryMemberIdentityPolicy;

const stringStaticCallWithoutReceiverPolicy = {
  ids: sourceLibraryMemberIdSet([
    "String.fromCharCode",
    "String.fromCodePoint",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

const regexpConstructorPolicy = {
  ids: sourceLibraryMemberIdSet(["RegExp.constructor"]),
} satisfies SourceLibraryMemberIdentityPolicy;

const arrayConcatSourceMemberPolicy = {
  ids: sourceLibraryMemberIdSet(["Array.concat"]),
} satisfies SourceLibraryMemberIdentityPolicy;

const jsonStringifySourceMemberPolicy = {
  ids: sourceLibraryMemberIdSet(["JSON.stringify"]),
} satisfies SourceLibraryMemberIdentityPolicy;

const finalFactsSensitiveCallPolicy = jsonStringifySourceMemberPolicy;
