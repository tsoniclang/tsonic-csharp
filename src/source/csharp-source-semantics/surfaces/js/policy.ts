import type {
  CheckedCallMappingRequest,
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
  getArrayTargetMembers,
  isCsharpJsArrayCarrierTargetType,
} from "./arrays.js";
import {
  getBooleanTargetMembers,
  isCsharpBooleanTargetType,
} from "./booleans.js";
import {
  getCollectionTargetMembers,
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./collections.js";
import {
  getDateTargetMembers,
  isCsharpJsDateRuntimeCarrier,
} from "./date.js";
import {
  getJsonTargetMembers,
  isCsharpJsJsonValueTargetType,
} from "./json.js";
import {
  getMathTargetMembers,
} from "./math.js";
import {
  getNumberTargetMembers,
  isCsharpNumberTargetType,
  numberStaticCallRequiresNoReceiver,
} from "./numbers.js";
import {
  isCsharpJsObjectCarrierTargetType,
  getObjectRecordDictionaryTargetMembers,
  getObjectTargetMembers,
} from "./objects.js";
import {
  getCsharpJsRegExpRuntimeCarrierForSubject,
  getRegExpTargetMembers,
  isCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryDeclaringName,
  SourceLibraryMember,
  SourceLibraryMemberId,
} from "./source-library.js";
import {
  getStringTargetMembers,
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
  readonly declaringNames: readonly SourceLibraryDeclaringName[];
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

export function csharpJsSourceLibraryMemberIsArrayConstructor(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined &&
    sourceMember.id === "Array.constructor";
}

export function csharpJsSourceLibraryMemberIsCollection(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined && sourceMemberIdMatchesAnyPrefix(sourceMember.id, collectionSourceMemberIdPrefixes);
}

export function csharpJsSourceLibraryCallRequiresPrevalidatedMember(sourceMember: SourceLibraryMember): boolean {
  return sourceMemberIdMatchesAnyPrefix(sourceMember.id, prevalidatedMemberRequiredSourceMemberIdPrefixes);
}

export function csharpJsSourceLibraryCallMayNeedFinalFacts(
  sourceMember: SourceLibraryMember,
  phase: "checking" | "finalization" | undefined,
): boolean {
  return phase !== "finalization" && finalFactsSensitiveCallIds.has(sourceMember.id);
}

export function csharpJsSourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceMemberIdMatchesAnyPrefix(sourceMember.id, ["Object."])) {
    return sourceLibraryObjectCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (sourceMemberIdMatchesAnyPrefix(sourceMember.id, ["JSON."])) {
    return sourceLibraryJsonCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (!csharpJsSourceLibraryCallRequiresClosedReceiver(sourceMember)) {
    return true;
  }
  return callClosedReceiverPolicies
    .find((policy) => sourceMemberIdMatchesAnyPrefix(sourceMember.id, policy.sourceMemberIdPrefixes))
    ?.validate(request, context, sourceMember, host) ?? true;
}

export function csharpJsSourceLibraryCallCanWaitForFinalizedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization" | undefined,
): boolean {
  if (sourceMemberIdMatchesAnyPrefix(sourceMember.id, ["Object."])) {
    return (phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context))) &&
      sourceLibraryObjectCallCanWaitForFinalizedFacts(sourceMember);
  }
  if (sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(sourceMember)) {
    return phase !== "finalization" && compilerContextCanRunLifecycleFinalization(context);
  }
  if (sourceMember.id === "Array.constructor") {
    return phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context));
  }
  if (phase === "finalization" || sourceMember.id !== "JSON.stringify") {
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
    policy.declaringNames.some((declaringName) => sourceMember.id.startsWith(`${declaringName}.`))
  );
}

const csharpJsSourceLibraryPolicies: readonly CsharpJsSurfaceSourceLibraryPolicy[] = [
  simpleCallPolicy(["Math"], (sourceMember) => getMathTargetMembers(sourceMemberName(sourceMember))),
  simpleCallPolicy(["String"], (sourceMember) => getStringTargetMembers(sourceMemberName(sourceMember))),
  simpleCallPolicy(["Number"], (sourceMember) => getNumberTargetMembers(sourceMemberName(sourceMember))),
  simpleCallPolicy(["Boolean"], (sourceMember) => getBooleanTargetMembers(sourceMemberName(sourceMember))),
  simpleCallPolicy(["RegExp"], (sourceMember) => getRegExpTargetMembers(sourceMemberName(sourceMember))),
  {
    declaringNames: ["Date"],
    getCallMembers: (sourceMember, request, context) =>
      getDateTargetMembers(sourceMemberName(sourceMember), isNewExpression(request.call, context) ? "new" : "call"),
    hasCallableProperty: (sourceMember) => getDateTargetMembers(sourceMemberName(sourceMember), "call").length > 0,
  },
  simpleCallPolicy(["JSON"], (sourceMember) => getJsonTargetMembers(sourceMemberName(sourceMember))),
  {
    declaringNames: ["Object"],
    getCallMembers: (sourceMember, request, context, host) => [
      ...getObjectTargetMembers(sourceMemberName(sourceMember)),
      ...getObjectPrimitiveReceiverCallMembers(request, context, host, sourceMember),
      ...getObjectRecordDictionaryCallMembers(sourceMember, request, context, host),
    ],
    hasCallableProperty: (sourceMember) => getObjectTargetMembers(sourceMemberName(sourceMember)).length > 0,
  },
  {
    declaringNames: ["Array", "ReadonlyArray"],
    getCallMembers: (sourceMember, request, context, host) => {
      const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
      if (sourceMember.id === "Array.constructor" && resultElementType === undefined) {
        return [];
      }
      return getArrayTargetMembers(
        sourceMemberName(sourceMember),
        resultElementType ??
          getSourceLibraryCallReceiverElementType(request, context, host) ??
          getSourceLibraryCallArgumentTargetTypes(request, context, host).map(getCsharpArrayLikeElementType).find((element) => element !== undefined),
      );
    },
    hasCallableProperty: (sourceMember) =>
      getArrayTargetMembers(sourceMemberName(sourceMember)).length > 0 ||
      arrayCallSurfaceMemberNames.has(sourceMemberName(sourceMember)),
  },
  {
    declaringNames: ["Map", "ReadonlyMap", "Set", "ReadonlySet"],
    getCallMembers: (sourceMember, request, context, host) => getCollectionTargetMembers(
      sourceMember,
      getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
      sourceMemberIdMatchesAny(sourceMember.id, collectionConstructorSourceMemberIds)
        ? getSourceLibraryCallResultTargetType(request, context, host)
        : undefined,
    ),
    hasCallableProperty: (sourceMember) => getCollectionTargetMembers(sourceMember, undefined, undefined).length > 0,
  },
  {
    declaringNames: ["Console"],
    hasCallableProperty: () => true,
  },
  {
    declaringNames: ["Promise"],
    hasCallableProperty: () => false,
  },
];

type SourceLibraryMemberIdPrefix = `${SourceLibraryDeclaringName}.`;

const collectionSourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[] = [
  "Map.",
  "ReadonlyMap.",
  "Set.",
  "ReadonlySet.",
];

const prevalidatedMemberRequiredSourceMemberIdPrefixes: readonly SourceLibraryMemberIdPrefix[] = [
  "Date.",
];

const collectionConstructorSourceMemberIds = sourceMemberIdSet([
  "Map.constructor",
  "ReadonlyMap.constructor",
  "Set.constructor",
  "ReadonlySet.constructor",
]);

const finalFactsSensitiveCallIds = sourceMemberIdSet([
  "JSON.stringify",
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
    if (sourceMember.id === "Array.concat" && getSourceLibraryCallArgumentTargetTypes(request, context, host).some((argumentType) => argumentType === undefined)) {
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
    sourceMemberIdMatchesAny(sourceMember.id, collectionConstructorSourceMemberIds) ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsMapTargetType(receiverType)) },
  { sourceMemberIdPrefixes: ["Set.", "ReadonlySet."], validate: (request, context, sourceMember, host) =>
    sourceMemberIdMatchesAny(sourceMember.id, collectionConstructorSourceMemberIds) ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsSetTargetType(receiverType)) },
];

function simpleCallPolicy(
  declaringNames: readonly SourceLibraryDeclaringName[],
  getMembers: (sourceMember: SourceLibraryMember) => readonly TargetMember[],
): CsharpJsSurfaceSourceLibraryPolicy {
  return {
    declaringNames,
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
  if (sourceMember.id !== "Object.toString") {
    return [];
  }
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  return receiverTypes.some((receiverType) => host.isCsharpStringType(receiverType))
    ? getStringTargetMembers(sourceMemberName(sourceMember))
    : receiverTypes.some((receiverType) => isCsharpNumberTargetType(receiverType))
      ? getNumberTargetMembers(sourceMemberName(sourceMember))
      : receiverTypes.some((receiverType) => receiverType?.kind === "source-primitive" && receiverType.name === "bool")
        ? getBooleanTargetMembers(sourceMemberName(sourceMember))
        : [];
}

function getObjectRecordDictionaryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  if (!objectRecordDictionarySourceMemberIds.has(sourceMember.id)) {
    return [];
  }
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : getObjectRecordDictionaryTargetMembers(sourceMemberName(sourceMember), dictionaryType);
}

function sourceLibraryJsonCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  switch (sourceMember.id) {
    case "JSON.parse":
      return host.isCsharpStringType(argumentTypes[0]);
    case "JSON.stringify":
      return isSupportedJsonValueTargetType(argumentTypes[0], host);
    default:
      return false;
  }
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
  if (sourceMember.id === "Object.hasOwnProperty") {
    return getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsObjectCarrierTargetType(receiverType));
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  switch (sourceMember.id) {
    case "Object.keys":
    case "Object.values":
    case "Object.entries":
      return isSupportedObjectHelperSourceTargetType(argumentTypes[0], host);
    case "Object.hasOwn":
      return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
        host.isCsharpStringType(argumentTypes[1]);
    case "Object.assign":
      return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
        argumentTypes.slice(1).every((argumentType) => isSupportedObjectHelperSourceTargetType(argumentType, host));
    default:
      return true;
  }
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
  return sourceMemberIdMatchesAny(sourceMember.id, arrayStaticCallWithoutReceiverSourceMemberIds);
}

function sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceMemberIdMatchesAny(sourceMember.id, dateStaticCallWithoutReceiverSourceMemberIds);
}

function csharpJsSourceLibraryCallRequiresClosedReceiver(sourceMember: SourceLibraryMember): boolean {
  const policy = closedReceiverRequirementPolicies.find((candidate) =>
    sourceMemberIdMatchesAnyPrefix(sourceMember.id, candidate.sourceMemberIdPrefixes)
  );
  if (policy === undefined) {
    return false;
  }
  return policy.requiresClosedReceiver(sourceMember);
}

function compilerContextCanRunLifecycleFinalization(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return typeof (context.compiler as { readonly getSourceFiles?: unknown } | undefined)?.getSourceFiles === "function";
}

function sourceLibraryObjectCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceMemberIdMatchesAny(sourceMember.id, objectCallCanWaitForFinalizedFactsSourceMemberIds);
}

function sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceMemberIdMatchesAnyPrefix(sourceMember.id, collectionOrPrimitiveCallCanWaitForFinalizedFactsSourceMemberIdPrefixes);
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

const objectRecordDictionarySourceMemberIds = sourceMemberIdSet([
  "Object.keys",
  "Object.values",
  "Object.entries",
]);

const arrayStaticCallWithoutReceiverSourceMemberIds = sourceMemberIdSet([
  "Array.constructor",
  "Array.from",
  "Array.of",
  "Array.isArray",
]);

const dateStaticCallWithoutReceiverSourceMemberIds = sourceMemberIdSet([
  "Date.constructor",
  "Date.now",
  "Date.parse",
  "Date.UTC",
]);

const objectCallCanWaitForFinalizedFactsSourceMemberIds = sourceMemberIdSet([
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
    requiresClosedReceiver: (sourceMember) => !sourceMemberIdMatchesAny(sourceMember.id, stringStaticCallWithoutReceiverSourceMemberIds),
  },
  {
    sourceMemberIdPrefixes: ["Number."],
    requiresClosedReceiver: (sourceMember) => !numberStaticCallRequiresNoReceiver(sourceMemberName(sourceMember)),
  },
  { sourceMemberIdPrefixes: ["Boolean."], requiresClosedReceiver: () => true },
  {
    sourceMemberIdPrefixes: ["RegExp."],
    requiresClosedReceiver: (sourceMember) => sourceMember.id !== "RegExp.constructor",
  },
  {
    sourceMemberIdPrefixes: ["Date."],
    requiresClosedReceiver: (sourceMember) => !sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember),
  },
  {
    sourceMemberIdPrefixes: ["Object."],
    requiresClosedReceiver: (sourceMember) => sourceMember.id === "Object.hasOwnProperty",
  },
  {
    sourceMemberIdPrefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
    requiresClosedReceiver: (sourceMember) => !sourceMemberIdMatchesAny(sourceMember.id, collectionConstructorSourceMemberIds),
  },
];

const stringStaticCallWithoutReceiverSourceMemberIds = sourceMemberIdSet([
  "String.fromCharCode",
  "String.fromCodePoint",
]);

function sourceMemberIdSet(ids: readonly SourceLibraryMemberId[]): ReadonlySet<SourceLibraryMemberId> {
  return new Set(ids);
}

function sourceMemberIdMatchesAny(sourceMemberId: SourceLibraryMemberId, ids: ReadonlySet<SourceLibraryMemberId>): boolean {
  return ids.has(sourceMemberId);
}

function sourceMemberIdMatchesAnyPrefix(
  sourceMemberId: SourceLibraryMemberId,
  prefixes: readonly SourceLibraryMemberIdPrefix[],
): boolean {
  return prefixes.some((prefix) => sourceMemberId.startsWith(prefix));
}

function sourceMemberName(sourceMember: SourceLibraryMember): string {
  return sourceMember.id.slice(sourceMember.id.indexOf(".") + 1);
}
