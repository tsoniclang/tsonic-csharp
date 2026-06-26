import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
  arrayTargetMembersForSourceName,
  isCsharpJsArrayCarrierTargetType,
} from "./arrays.js";
import {
  booleanTargetMembersForSourceName,
  isCsharpBooleanTargetType,
} from "./booleans.js";
import {
  mapCsharpJsConsoleCheckedCall,
} from "./console.js";
import {
  collectionTargetMembersForSourceMember,
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./collections.js";
import {
  dateTargetMembersForSourceName,
  isCsharpJsDateRuntimeCarrier,
} from "./date.js";
import {
  jsonTargetMembersForSourceName,
  isCsharpJsJsonValueTargetType,
} from "./json.js";
import {
  mathTargetMembersForSourceName,
} from "./math.js";
import {
  isCsharpNumberTargetType,
  numberTargetMembersForSourceName,
  numberStaticCallRequiresNoReceiver,
} from "./numbers.js";
import {
  isCsharpJsObjectCarrierTargetType,
  objectRecordDictionaryTargetMembersForSourceName,
  objectTargetMembersForSourceName,
} from "./objects.js";
import {
  getCsharpJsRegExpRuntimeCarrierForSubject,
  isCsharpJsRegExpRuntimeCarrier,
  regExpTargetMembersForSourceName,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberId,
  SourceLibraryMemberIdPrefix,
} from "./source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatchesAny,
  sourceLibraryMemberMatchesAnyPrefix,
  sourceLibraryMemberName,
} from "./source-library.js";
import {
  stringTargetMembersForSourceName,
} from "./strings.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../dictionaries.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverElementType,
  getSourceLibraryCallReceiverTargetTypes,
  getSourceLibraryCallResultTargetType,
  isNewExpression,
  isNumericSourcePrimitive,
  isStringKeyedRecordDictionaryTargetType,
} from "./calls/helpers.js";

export interface CsharpJsSurfaceSourceLibraryPolicy {
  readonly sourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[];
  readonly mapCall?: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
    sourceMember: SourceLibraryMember,
    host: CsharpJsSurfaceHost,
    options: { readonly phase?: "checking" | "finalization" },
  ) => ExtensionObservation<CheckedCallMappingResult> | undefined;
  readonly getCallMembers?: (
    sourceMember: SourceLibraryMember,
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
    host: CsharpJsSurfaceHost,
  ) => readonly TargetMember[];
  readonly hasCallableProperty?: (sourceMember: SourceLibraryMember) => boolean;
}

export function getCsharpJsSourceLibraryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  return policyForSourceMember(sourceMember)?.getCallMembers?.(sourceMember, request, context, host) ?? [];
}

export function csharpJsSourceLibraryMemberHasCallableTarget(
  sourceMember: SourceLibraryMember,
): boolean {
  return policyForSourceMember(sourceMember)?.hasCallableProperty?.(sourceMember) ?? false;
}

export function mapCsharpJsSourceLibrarySpecialCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" },
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  return policyForSourceMember(sourceMember)?.mapCall?.(request, context, sourceMember, host, options);
}

export function csharpJsSourceLibraryMemberIsArrayConstructor(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined &&
    sourceLibraryMemberMatchesAny(sourceMember, arrayConstructorSourceMemberIds);
}

export function csharpJsSourceLibraryMemberIsCollection(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined && sourceLibraryMemberMatchesAnyPrefix(sourceMember, collectionSourceMemberIdPrefixes);
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
  if (sourceLibraryMemberMatchesAnyPrefix(sourceMember, objectSourceMemberIdPrefixes)) {
    return sourceLibraryObjectCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (sourceLibraryMemberMatchesAnyPrefix(sourceMember, jsonSourceMemberIdPrefixes)) {
    return sourceLibraryJsonCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (!csharpJsSourceLibraryCallRequiresClosedReceiver(sourceMember)) {
    return true;
  }
  return callClosedReceiverPolicies
    .find((policy) => sourceLibraryMemberMatchesAnyPrefix(sourceMember, policy.sourceMemberIdPrefixes))
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
  if (sourceLibraryMemberMatchesAnyPrefix(sourceMember, objectSourceMemberIdPrefixes)) {
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

function policyForSourceMember(sourceMember: SourceLibraryMember): CsharpJsSurfaceSourceLibraryPolicy | undefined {
  return csharpJsSourceLibraryPolicies.find((policy) =>
    sourceLibraryMemberMatchesAnyPrefix(sourceMember, policy.sourceMemberIdPrefixes)
  );
}

const csharpJsSourceLibraryPolicies: readonly CsharpJsSurfaceSourceLibraryPolicy[] = [
  simpleCallPolicy(["Math."], (sourceMember) => mathTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  simpleCallPolicy(["String."], (sourceMember) => stringTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  simpleCallPolicy(["Number."], (sourceMember) => numberTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  simpleCallPolicy(["Boolean."], (sourceMember) => booleanTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  simpleCallPolicy(["RegExp."], (sourceMember) => regExpTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  {
    sourceMemberIdPrefixes: ["Date."],
    getCallMembers: (sourceMember, request, context) =>
      dateTargetMembersForSourceName(sourceLibraryMemberName(sourceMember), isNewExpression(request.call, context) ? "new" : "call"),
    hasCallableProperty: (sourceMember) => dateTargetMembersForSourceName(sourceLibraryMemberName(sourceMember), "call").length > 0,
  },
  simpleCallPolicy(["JSON."], (sourceMember) => jsonTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  {
    sourceMemberIdPrefixes: ["Object."],
    getCallMembers: (sourceMember, request, context, host) => [
      ...objectTargetMembersForSourceName(sourceLibraryMemberName(sourceMember)),
      ...getObjectPrimitiveReceiverCallMembers(request, context, host, sourceMember),
      ...getObjectRecordDictionaryCallMembers(sourceMember, request, context, host),
    ],
    hasCallableProperty: (sourceMember) => objectTargetMembersForSourceName(sourceLibraryMemberName(sourceMember)).length > 0,
  },
  {
    sourceMemberIdPrefixes: ["Array.", "ReadonlyArray."],
    getCallMembers: (sourceMember, request, context, host) => {
      const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
      if (sourceLibraryMemberMatchesAny(sourceMember, arrayConstructorSourceMemberIds) && resultElementType === undefined) {
        return [];
      }
      return arrayTargetMembersForSourceName(
        sourceLibraryMemberName(sourceMember),
        resultElementType ??
          getSourceLibraryCallReceiverElementType(request, context, host) ??
          getSourceLibraryCallArgumentTargetTypes(request, context, host).map(getCsharpArrayLikeElementType).find((element) => element !== undefined),
      );
    },
    hasCallableProperty: (sourceMember) =>
      arrayTargetMembersForSourceName(sourceLibraryMemberName(sourceMember)).length > 0 ||
      arrayCallSurfaceMemberNames.has(sourceLibraryMemberName(sourceMember)),
  },
  {
    sourceMemberIdPrefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
    getCallMembers: (sourceMember, request, context, host) => collectionTargetMembersForSourceMember(
      sourceMember,
      getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
      sourceLibraryMemberMatchesAny(sourceMember, collectionConstructorSourceMemberIds)
        ? getSourceLibraryCallResultTargetType(request, context, host)
        : undefined,
    ),
    hasCallableProperty: (sourceMember) => collectionTargetMembersForSourceMember(sourceMember, undefined, undefined).length > 0,
  },
  {
    sourceMemberIdPrefixes: ["Console."],
    mapCall: mapCsharpJsConsoleCheckedCall,
    hasCallableProperty: () => true,
  },
  {
    sourceMemberIdPrefixes: ["Promise."],
    hasCallableProperty: () => false,
  },
];

const collectionSourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[] = [
  "Map.",
  "ReadonlyMap.",
  "Set.",
  "ReadonlySet.",
];

const objectSourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[] = ["Object."];
const jsonSourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[] = ["JSON."];

const arrayConstructorSourceMemberIds = sourceLibraryMemberIdSet(["Array.constructor"]);
const arrayConcatSourceMemberIds = sourceLibraryMemberIdSet(["Array.concat"]);

const jsonStringifySourceMemberIds = sourceLibraryMemberIdSet([
  "JSON.stringify",
]);

const collectionConstructorSourceMemberIds = sourceLibraryMemberIdSet([
  "Map.constructor",
  "ReadonlyMap.constructor",
  "Set.constructor",
  "ReadonlySet.constructor",
]);

const finalFactsSensitiveCallIds = sourceLibraryMemberIdSet([
  "JSON.stringify",
]);

type JsonClosedFactsValidator = (
  argumentTypes: readonly (TargetTypeRef | undefined)[],
  host: CsharpJsSurfaceHost,
) => boolean;

const jsonClosedFactsValidators: ReadonlyMap<SourceLibraryMemberId, JsonClosedFactsValidator> = new Map([
  ["JSON.parse", (argumentTypes, host) => host.isCsharpStringType(argumentTypes[0])],
  ["JSON.stringify", (argumentTypes, host) => isSupportedJsonValueTargetType(argumentTypes[0], host)],
]);

type ObjectClosedFactsValidator = (
  argumentTypes: readonly (TargetTypeRef | undefined)[],
  host: CsharpJsSurfaceHost,
) => boolean;

const objectClosedFactsValidators: ReadonlyMap<SourceLibraryMemberId, ObjectClosedFactsValidator> = new Map([
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
  readonly sourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[];
  readonly validate: CallReceiverClosedFactsPolicy;
}

const callClosedReceiverPolicies: readonly CallReceiverClosedFactsPolicyEntry[] = [
  { sourceMemberIdPrefixes: ["Array."], validate: (request, context, sourceMember, host) => {
    if (sourceLibraryMemberMatchesAny(sourceMember, arrayConcatSourceMemberIds) && getSourceLibraryCallArgumentTargetTypes(request, context, host).some((argumentType) => argumentType === undefined)) {
      return false;
    }
    return sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember) ||
      getSourceLibraryCallReceiverTargetTypes(request, context, host)
        .some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined);
  } },
  { sourceMemberIdPrefixes: ["ReadonlyArray."], validate: (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined) },
  { sourceMemberIdPrefixes: ["String."], validate: (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => host.isCsharpStringType(receiverType)) },
  { sourceMemberIdPrefixes: ["Number."], validate: (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpNumberTargetType(receiverType)) },
  { sourceMemberIdPrefixes: ["Boolean."], validate: (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpBooleanTargetType(receiverType)) },
  { sourceMemberIdPrefixes: ["RegExp."], validate: (request, context, _sourceMember, host) => {
    const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
    return receiverTypes.some((receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType)) ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiver, context) !== undefined ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverSymbol, context) !== undefined ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverResolvedSymbol, context) !== undefined;
  } },
  { sourceMemberIdPrefixes: ["Date."], validate: (request, context, sourceMember, host) =>
    sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember) ||
    request.sourceSelectedDeclaration !== undefined ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsDateRuntimeCarrier(receiverType)) },
  { sourceMemberIdPrefixes: ["Map.", "ReadonlyMap."], validate: (request, context, sourceMember, host) =>
    sourceLibraryMemberMatchesAny(sourceMember, collectionConstructorSourceMemberIds) ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsMapTargetType(receiverType)) },
  { sourceMemberIdPrefixes: ["Set.", "ReadonlySet."], validate: (request, context, sourceMember, host) =>
    sourceLibraryMemberMatchesAny(sourceMember, collectionConstructorSourceMemberIds) ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsSetTargetType(receiverType)) },
];

function simpleCallPolicy(
  sourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[],
  getMembers: (sourceMember: SourceLibraryMember) => readonly TargetMember[],
): CsharpJsSurfaceSourceLibraryPolicy {
  return {
    sourceMemberIdPrefixes,
    getCallMembers: getMembers,
    hasCallableProperty: (sourceMember) => getMembers(sourceMember).length > 0,
  };
}

function getObjectPrimitiveReceiverCallMembers(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  sourceMember: SourceLibraryMember,
): readonly TargetMember[] {
  if (!sourceLibraryMemberMatchesAny(sourceMember, objectToStringSourceMemberIds)) {
    return [];
  }
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  return receiverTypes.some((receiverType) => host.isCsharpStringType(receiverType))
    ? stringTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
    : receiverTypes.some((receiverType) => isCsharpNumberTargetType(receiverType))
      ? numberTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
      : receiverTypes.some((receiverType) => receiverType?.kind === "source-primitive" && receiverType.name === "bool")
        ? booleanTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
        : [];
}

function getObjectRecordDictionaryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  if (!sourceLibraryMemberMatchesAny(sourceMember, objectRecordDictionarySourceMemberIds)) {
    return [];
  }
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : objectRecordDictionaryTargetMembersForSourceName(sourceLibraryMemberName(sourceMember), dictionaryType);
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
    sourceLibraryMemberMatchesAnyPrefix(sourceMember, candidate.sourceMemberIdPrefixes)
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
  return sourceLibraryMemberMatchesAnyPrefix(sourceMember, collectionOrPrimitiveCallCanWaitForFinalizedFactsSourceMemberIdPrefixes);
}

function targetTypeIsOpaqueAny(type: TargetTypeRef): boolean {
  return type.kind === "opaque" && type.id === "any";
}

const arrayCallSurfaceMemberNames = new Set([
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

const objectToStringSourceMemberIds = sourceLibraryMemberIdSet(["Object.toString"]);

const objectHasOwnPropertySourceMemberIds = sourceLibraryMemberIdSet(["Object.hasOwnProperty"]);

const objectRecordDictionarySourceMemberIds = sourceLibraryMemberIdSet([
  "Object.keys",
  "Object.values",
  "Object.entries",
]);

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

const collectionOrPrimitiveCallCanWaitForFinalizedFactsSourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[] = [
  "Boolean.",
  "Number.",
  "Map.",
  "ReadonlyMap.",
  "Set.",
  "ReadonlySet.",
];

interface ClosedReceiverRequirementPolicy {
  readonly sourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[];
  readonly requiresClosedReceiver: (sourceMember: SourceLibraryMember) => boolean;
}

const closedReceiverRequirementPolicies: readonly ClosedReceiverRequirementPolicy[] = [
  {
    sourceMemberIdPrefixes: ["Array."],
    requiresClosedReceiver: (sourceMember) => !sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember),
  },
  { sourceMemberIdPrefixes: ["ReadonlyArray."], requiresClosedReceiver: () => true },
  {
    sourceMemberIdPrefixes: ["String."],
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatchesAny(sourceMember, stringStaticCallWithoutReceiverSourceMemberIds),
  },
  {
    sourceMemberIdPrefixes: ["Number."],
    requiresClosedReceiver: (sourceMember) => !numberStaticCallRequiresNoReceiver(sourceLibraryMemberName(sourceMember)),
  },
  { sourceMemberIdPrefixes: ["Boolean."], requiresClosedReceiver: () => true },
  {
    sourceMemberIdPrefixes: ["RegExp."],
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatchesAny(sourceMember, regexpConstructorSourceMemberIds),
  },
  {
    sourceMemberIdPrefixes: ["Date."],
    requiresClosedReceiver: (sourceMember) => !sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember),
  },
  {
    sourceMemberIdPrefixes: ["Object."],
    requiresClosedReceiver: (sourceMember) => sourceLibraryMemberMatchesAny(sourceMember, objectHasOwnPropertySourceMemberIds),
  },
  {
    sourceMemberIdPrefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
    requiresClosedReceiver: (sourceMember) => !sourceLibraryMemberMatchesAny(sourceMember, collectionConstructorSourceMemberIds),
  },
];

const stringStaticCallWithoutReceiverSourceMemberIds = sourceLibraryMemberIdSet([
  "String.fromCharCode",
  "String.fromCodePoint",
]);

const regexpConstructorSourceMemberIds = sourceLibraryMemberIdSet(["RegExp.constructor"]);
