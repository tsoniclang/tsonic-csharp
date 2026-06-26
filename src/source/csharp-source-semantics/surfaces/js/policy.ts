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
    sourceMember.declaringName === "Array" &&
    sourceMember.memberName === "constructor";
}

export function csharpJsSourceLibraryMemberIsCollection(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined && collectionSourceNames.has(sourceMember.declaringName);
}

export function csharpJsSourceLibraryCallRequiresPrevalidatedMember(sourceMember: SourceLibraryMember): boolean {
  return prevalidatedMemberRequiredSourceNames.has(sourceMember.declaringName);
}

export function csharpJsSourceLibraryCallMayNeedFinalFacts(
  sourceMember: SourceLibraryMember,
  phase: "checking" | "finalization" | undefined,
): boolean {
  return phase !== "finalization" && finalFactsSensitiveCallIds.has(sourceLibraryCallId(sourceMember));
}

export function csharpJsSourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceMember.declaringName === "Object") {
    return sourceLibraryObjectCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (sourceMember.declaringName === "JSON") {
    return sourceLibraryJsonCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (!csharpJsSourceLibraryCallRequiresClosedReceiver(sourceMember)) {
    return true;
  }
  return callClosedReceiverPoliciesByDeclaringName.get(sourceMember.declaringName)?.(request, context, sourceMember, host) ?? true;
}

export function csharpJsSourceLibraryCallCanWaitForFinalizedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization" | undefined,
): boolean {
  if (sourceMember.declaringName === "Object") {
    return (phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context))) &&
      sourceLibraryObjectCallCanWaitForFinalizedFacts(sourceMember);
  }
  if (sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(sourceMember)) {
    return phase !== "finalization" && compilerContextCanRunLifecycleFinalization(context);
  }
  if (sourceMember.declaringName === "Array" && sourceMember.memberName === "constructor") {
    return phase === "checking" || (phase === undefined && compilerContextCanRunLifecycleFinalization(context));
  }
  if (phase === "finalization" || sourceMember.declaringName !== "JSON" || sourceMember.memberName !== "stringify") {
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
  return policiesByDeclaringName.get(sourceMember.declaringName);
}

const csharpJsSourceLibraryPolicies: readonly CsharpJsSurfaceSourceLibraryPolicy[] = [
  simpleCallPolicy(["Math"], (sourceMember) => getMathTargetMembers(sourceMember.memberName)),
  simpleCallPolicy(["String"], (sourceMember) => getStringTargetMembers(sourceMember.memberName)),
  simpleCallPolicy(["Number"], (sourceMember) => getNumberTargetMembers(sourceMember.memberName)),
  simpleCallPolicy(["Boolean"], (sourceMember) => getBooleanTargetMembers(sourceMember.memberName)),
  simpleCallPolicy(["RegExp"], (sourceMember) => getRegExpTargetMembers(sourceMember.memberName)),
  {
    declaringNames: ["Date"],
    getCallMembers: (sourceMember, request, context) =>
      getDateTargetMembers(sourceMember.memberName, isNewExpression(request.call, context) ? "new" : "call"),
    hasCallableProperty: (sourceMember) => getDateTargetMembers(sourceMember.memberName, "call").length > 0,
  },
  simpleCallPolicy(["JSON"], (sourceMember) => getJsonTargetMembers(sourceMember.memberName)),
  {
    declaringNames: ["Object"],
    getCallMembers: (sourceMember, request, context, host) => [
      ...getObjectTargetMembers(sourceMember.memberName),
      ...getObjectPrimitiveReceiverCallMembers(request, context, host, sourceMember),
      ...getObjectRecordDictionaryCallMembers(sourceMember, request, context, host),
    ],
    hasCallableProperty: (sourceMember) => getObjectTargetMembers(sourceMember.memberName).length > 0,
  },
  {
    declaringNames: ["Array", "ReadonlyArray"],
    getCallMembers: (sourceMember, request, context, host) => {
      const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
      if (sourceMember.memberName === "constructor" && resultElementType === undefined) {
        return [];
      }
      return getArrayTargetMembers(
        sourceMember.memberName,
        resultElementType ??
          getSourceLibraryCallReceiverElementType(request, context, host) ??
          getSourceLibraryCallArgumentTargetTypes(request, context, host).map(getCsharpArrayLikeElementType).find((element) => element !== undefined),
      );
    },
    hasCallableProperty: (sourceMember) =>
      getArrayTargetMembers(sourceMember.memberName).length > 0 ||
      arrayCallSurfaceMemberNames.has(sourceMember.memberName),
  },
  {
    declaringNames: ["Map", "ReadonlyMap", "Set", "ReadonlySet"],
    getCallMembers: (sourceMember, request, context, host) => getCollectionTargetMembers(
      sourceMember,
      getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
      sourceMember.memberName === "constructor"
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

const policiesByDeclaringName = new Map<SourceLibraryDeclaringName, CsharpJsSurfaceSourceLibraryPolicy>(
  csharpJsSourceLibraryPolicies.flatMap((policy) =>
    policy.declaringNames.map((declaringName) => [declaringName, policy] as const)
  ),
);

const collectionSourceNames = new Set<SourceLibraryDeclaringName>([
  "Map",
  "ReadonlyMap",
  "Set",
  "ReadonlySet",
]);

const prevalidatedMemberRequiredSourceNames = new Set<SourceLibraryDeclaringName>([
  "Date",
]);

const finalFactsSensitiveCallIds = new Set([
  "JSON.stringify",
]);

function sourceLibraryCallId(sourceMember: SourceLibraryMember): string {
  return `${sourceMember.declaringName}.${sourceMember.memberName}`;
}

type CallReceiverClosedFactsPolicy = (
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
) => boolean;

const callClosedReceiverPoliciesByDeclaringName = new Map<SourceLibraryDeclaringName, CallReceiverClosedFactsPolicy>([
  ["Array", (request, context, sourceMember, host) => {
    if (sourceMember.memberName === "concat" && getSourceLibraryCallArgumentTargetTypes(request, context, host).some((argumentType) => argumentType === undefined)) {
      return false;
    }
    return sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember) ||
      getSourceLibraryCallReceiverTargetTypes(request, context, host)
        .some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined);
  }],
  ["ReadonlyArray", (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined)],
  ["String", (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => host.isCsharpStringType(receiverType))],
  ["Number", (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpNumberTargetType(receiverType))],
  ["Boolean", (request, context, _sourceMember, host) =>
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpBooleanTargetType(receiverType))],
  ["RegExp", (request, context, _sourceMember, host) => {
    const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
    return receiverTypes.some((receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType)) ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiver, context) !== undefined ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverSymbol, context) !== undefined ||
      getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverResolvedSymbol, context) !== undefined;
  }],
  ["Date", (request, context, sourceMember, host) =>
    sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember) ||
    request.sourceSelectedDeclaration !== undefined ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsDateRuntimeCarrier(receiverType))],
  ["Map", (request, context, sourceMember, host) =>
    sourceMember.memberName === "constructor" ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsMapTargetType(receiverType))],
  ["ReadonlyMap", (request, context, sourceMember, host) =>
    sourceMember.memberName === "constructor" ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsMapTargetType(receiverType))],
  ["Set", (request, context, sourceMember, host) =>
    sourceMember.memberName === "constructor" ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsSetTargetType(receiverType))],
  ["ReadonlySet", (request, context, sourceMember, host) =>
    sourceMember.memberName === "constructor" ||
    getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsSetTargetType(receiverType))],
]);

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
  if (sourceMember.memberName !== "toString") {
    return [];
  }
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  return receiverTypes.some((receiverType) => host.isCsharpStringType(receiverType))
    ? getStringTargetMembers(sourceMember.memberName)
    : receiverTypes.some((receiverType) => isCsharpNumberTargetType(receiverType))
      ? getNumberTargetMembers(sourceMember.memberName)
      : receiverTypes.some((receiverType) => receiverType?.kind === "source-primitive" && receiverType.name === "bool")
        ? getBooleanTargetMembers(sourceMember.memberName)
        : [];
}

function getObjectRecordDictionaryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  if (sourceMember.memberName !== "keys" && sourceMember.memberName !== "values" && sourceMember.memberName !== "entries") {
    return [];
  }
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : getObjectRecordDictionaryTargetMembers(sourceMember.memberName, dictionaryType);
}

function sourceLibraryJsonCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  switch (sourceMember.memberName) {
    case "parse":
      return host.isCsharpStringType(argumentTypes[0]);
    case "stringify":
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
  if (sourceMember.memberName === "hasOwnProperty") {
    return getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsObjectCarrierTargetType(receiverType));
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  switch (sourceMember.memberName) {
    case "keys":
    case "values":
    case "entries":
      return isSupportedObjectHelperSourceTargetType(argumentTypes[0], host);
    case "hasOwn":
      return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
        host.isCsharpStringType(argumentTypes[1]);
    case "assign":
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
  return sourceMember.declaringName === "Array" &&
    (sourceMember.memberName === "constructor" || sourceMember.memberName === "from" || sourceMember.memberName === "of" || sourceMember.memberName === "isArray");
}

function sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceMember.declaringName === "Date" &&
    (
      sourceMember.memberName === "constructor" ||
      sourceMember.memberName === "now" ||
      sourceMember.memberName === "parse" ||
      sourceMember.memberName === "UTC"
    );
}

function csharpJsSourceLibraryCallRequiresClosedReceiver(sourceMember: SourceLibraryMember): boolean {
  switch (sourceMember.declaringName) {
    case "Array":
      return !sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember);
    case "ReadonlyArray":
      return true;
    case "String":
      return sourceMember.memberName !== "fromCharCode" && sourceMember.memberName !== "fromCodePoint";
    case "Number":
      return !numberStaticCallRequiresNoReceiver(sourceMember.memberName);
    case "Boolean":
      return true;
    case "RegExp":
      return sourceMember.memberName !== "constructor";
    case "Date":
      return !sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember);
    case "Object":
      return sourceMember.memberName === "hasOwnProperty";
    case "Map":
    case "ReadonlyMap":
    case "Set":
    case "ReadonlySet":
      return sourceMember.memberName !== "constructor";
    default:
      return false;
  }
}

function compilerContextCanRunLifecycleFinalization(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return typeof (context.compiler as { readonly getSourceFiles?: unknown } | undefined)?.getSourceFiles === "function";
}

function sourceLibraryObjectCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceMember.memberName === "keys" ||
    sourceMember.memberName === "values" ||
    sourceMember.memberName === "entries" ||
    sourceMember.memberName === "hasOwn" ||
    sourceMember.memberName === "assign" ||
    sourceMember.memberName === "toString";
}

function sourceLibraryCollectionOrPrimitiveCallCanWaitForFinalizedFacts(
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceMember.declaringName === "Boolean" ||
    sourceMember.declaringName === "Number" ||
    sourceMember.declaringName === "Map" ||
    sourceMember.declaringName === "ReadonlyMap" ||
    sourceMember.declaringName === "Set" ||
    sourceMember.declaringName === "ReadonlySet";
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
