import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
  arrayTargetMembersForSourceName,
} from "../arrays.js";
import {
  booleanTargetMembersForSourceName,
} from "../booleans.js";
import {
  mapCsharpJsConsoleCheckedCall,
} from "../console.js";
import {
  collectionTargetMembersForSourceMember,
} from "../collections.js";
import {
  dateTargetMembersForSourceName,
} from "../date/index.js";
import {
  jsonTargetMembersForSourceName,
} from "../json.js";
import {
  mathTargetMembersForSourceName,
} from "../math.js";
import {
  isCsharpNumberTargetType,
  numberTargetMembersForSourceName,
} from "../numbers.js";
import {
  objectRecordDictionaryTargetMembersForSourceName,
  objectTargetMembersForSourceName,
} from "../objects.js";
import {
  regExpTargetMembersForSourceName,
} from "../regexp/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberMatches,
  sourceLibraryMemberName,
} from "../source-library.js";
import {
  stringTargetMembersForSourceName,
} from "../strings.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../../dictionaries.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverElementType,
  getSourceLibraryCallReceiverTargetTypes,
  getSourceLibraryCallResultTargetType,
  isNewExpression,
  isStringKeyedRecordDictionaryTargetType,
} from "./helpers.js";

export interface CsharpJsSurfaceSourceLibraryPolicy {
  readonly identity: SourceLibraryMemberIdentityPolicy;
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

export const collectionIdentityPolicy = {
  prefixes: ["Map.", "ReadonlyMap.", "Set.", "ReadonlySet."],
} satisfies SourceLibraryMemberIdentityPolicy;

export const arrayConstructorIdentityPolicy = {
  ids: sourceLibraryMemberIdSet(["Array.constructor"]),
} satisfies SourceLibraryMemberIdentityPolicy;

export const collectionConstructorIdentityPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Map.constructor",
    "ReadonlyMap.constructor",
    "Set.constructor",
    "ReadonlySet.constructor",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;

export function getCsharpJsSourceLibraryCallMembersFromProviders(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  return providerForSourceMember(sourceMember)?.getCallMembers?.(sourceMember, request, context, host) ?? [];
}

export function csharpJsSourceLibraryMemberHasCallableProvider(
  sourceMember: SourceLibraryMember,
): boolean {
  return providerForSourceMember(sourceMember)?.hasCallableProperty?.(sourceMember) ?? false;
}

export function mapCsharpJsSourceLibraryProviderCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" },
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  return providerForSourceMember(sourceMember)?.mapCall?.(request, context, sourceMember, host, options);
}

export function csharpJsSourceLibraryMemberIsArrayConstructor(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined &&
    sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy);
}

export function csharpJsSourceLibraryMemberIsCollection(sourceMember: SourceLibraryMember | undefined): boolean {
  return sourceMember !== undefined && sourceLibraryMemberMatches(sourceMember, collectionIdentityPolicy);
}

function providerForSourceMember(sourceMember: SourceLibraryMember): CsharpJsSurfaceSourceLibraryPolicy | undefined {
  return csharpJsSourceLibraryProviders.find((provider) =>
    sourceLibraryMemberMatches(sourceMember, provider.identity)
  );
}

const csharpJsSourceLibraryProviders: readonly CsharpJsSurfaceSourceLibraryPolicy[] = [
  simpleCallProvider({ prefixes: ["Math."] }, (sourceMember) => mathTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  simpleCallProvider({ prefixes: ["String."] }, (sourceMember) => stringTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  simpleCallProvider({ prefixes: ["Number."] }, (sourceMember) => numberTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  simpleCallProvider({ prefixes: ["Boolean."] }, (sourceMember) => booleanTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  simpleCallProvider({ prefixes: ["RegExp."] }, (sourceMember) => regExpTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  {
    identity: { prefixes: ["Date."] },
    getCallMembers: (sourceMember, request, context) =>
      dateTargetMembersForSourceName(sourceLibraryMemberName(sourceMember), isNewExpression(request.call, context) ? "new" : "call"),
    hasCallableProperty: (sourceMember) => dateTargetMembersForSourceName(sourceLibraryMemberName(sourceMember), "call").length > 0,
  },
  simpleCallProvider({ prefixes: ["JSON."] }, (sourceMember) => jsonTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))),
  {
    identity: { prefixes: ["Object."] },
    getCallMembers: (sourceMember, request, context, host) => [
      ...objectTargetMembersForSourceName(sourceLibraryMemberName(sourceMember)),
      ...getObjectPrimitiveReceiverCallMembers(request, context, host, sourceMember),
      ...getObjectRecordDictionaryCallMembers(sourceMember, request, context, host),
    ],
    hasCallableProperty: (sourceMember) => objectTargetMembersForSourceName(sourceLibraryMemberName(sourceMember)).length > 0,
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    getCallMembers: (sourceMember, request, context, host) => {
      const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
      if (sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy) && resultElementType === undefined) {
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
    identity: collectionIdentityPolicy,
    getCallMembers: (sourceMember, request, context, host) => collectionTargetMembersForSourceMember(
      sourceMember,
      getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
      sourceLibraryMemberMatches(sourceMember, collectionConstructorIdentityPolicy)
        ? getSourceLibraryCallResultTargetType(request, context, host)
        : undefined,
    ),
    hasCallableProperty: (sourceMember) => collectionTargetMembersForSourceMember(sourceMember, undefined, undefined).length > 0,
  },
  {
    identity: { prefixes: ["Console."] },
    mapCall: mapCsharpJsConsoleCheckedCall,
    hasCallableProperty: () => true,
  },
  {
    identity: { prefixes: ["Promise."] },
    hasCallableProperty: () => false,
  },
];

function simpleCallProvider(
  identity: SourceLibraryMemberIdentityPolicy,
  getMembers: (sourceMember: SourceLibraryMember) => readonly TargetMember[],
): CsharpJsSurfaceSourceLibraryPolicy {
  return {
    identity,
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
  if (!sourceLibraryMemberMatches(sourceMember, objectToStringIdentityPolicy)) {
    return [];
  }
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  return receiverTypes.some((receiverType) => host.isCsharpStringType(receiverType))
    ? stringTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
    : receiverTypes.some((receiverType) => receiverType?.kind === "source-primitive" && receiverType.name === "bool")
      ? booleanTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
      : numberOrNoObjectPrimitiveReceiverMembers(sourceMember, receiverTypes);
}

function numberOrNoObjectPrimitiveReceiverMembers(
  sourceMember: SourceLibraryMember,
  receiverTypes: ReturnType<typeof getSourceLibraryCallReceiverTargetTypes>,
): readonly TargetMember[] {
  return receiverTypes.some((receiverType) => isCsharpNumberTargetType(receiverType))
    ? numberTargetMembersForSourceName(sourceLibraryMemberName(sourceMember))
    : [];
}

function getObjectRecordDictionaryCallMembers(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  if (!sourceLibraryMemberMatches(sourceMember, objectRecordDictionaryIdentityPolicy)) {
    return [];
  }
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request, context, host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, host));
  return dictionaryType === undefined
    ? []
    : objectRecordDictionaryTargetMembersForSourceName(sourceLibraryMemberName(sourceMember), dictionaryType);
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

const objectToStringIdentityPolicy = {
  ids: sourceLibraryMemberIdSet(["Object.toString"]),
} satisfies SourceLibraryMemberIdentityPolicy;

const objectRecordDictionaryIdentityPolicy = {
  ids: sourceLibraryMemberIdSet([
    "Object.keys",
    "Object.values",
    "Object.entries",
  ]),
} satisfies SourceLibraryMemberIdentityPolicy;
