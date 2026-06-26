import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
  getArrayTargetMembers,
} from "./arrays.js";
import {
  getBooleanTargetMembers,
} from "./booleans.js";
import {
  getCollectionTargetMembers,
} from "./collections.js";
import {
  getDateTargetMembers,
} from "./date.js";
import {
  getJsonTargetMembers,
} from "./json.js";
import {
  getMathTargetMembers,
} from "./math.js";
import {
  getNumberTargetMembers,
  isCsharpNumberTargetType,
} from "./numbers.js";
import {
  getObjectRecordDictionaryTargetMembers,
  getObjectTargetMembers,
} from "./objects.js";
import {
  getRegExpTargetMembers,
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
