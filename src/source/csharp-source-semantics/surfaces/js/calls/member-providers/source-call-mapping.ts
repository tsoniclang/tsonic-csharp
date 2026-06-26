import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
  arrayTargetMembersForSourceName,
} from "../../arrays.js";
import {
  booleanTargetMembersForSourceName,
} from "../../booleans.js";
import {
  mapCsharpJsConsoleCheckedCall,
} from "../../console.js";
import {
  collectionTargetMembersForSourceMember,
} from "../../collections.js";
import {
  dateTargetMembersForSourceName,
} from "../../date/index.js";
import {
  jsonTargetMembersForSourceName,
} from "../../json.js";
import {
  mathTargetMembersForSourceName,
} from "../../math.js";
import {
  numberTargetMembersForSourceName,
} from "../../numbers.js";
import {
  objectTargetMembersForSourceName,
} from "../../objects.js";
import {
  regExpTargetMembersForSourceName,
} from "../../regexp/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";
import {
  sourceLibraryMemberMatches,
  sourceLibraryMemberName,
} from "../../source-library.js";
import {
  stringTargetMembersForSourceName,
} from "../../strings.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverElementType,
  getSourceLibraryCallReceiverTargetTypes,
  getSourceLibraryCallResultTargetType,
  isNewExpression,
} from "../helpers.js";
import {
  arrayCallSurfaceMemberNames,
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
  collectionIdentityPolicy,
} from "./identities.js";
import {
  getObjectPrimitiveReceiverCallMembers,
  getObjectRecordDictionaryCallMembers,
} from "./object-members.js";
import type {
  CsharpJsSurfaceSourceLibraryPolicy,
} from "./types.js";

interface SourceCallPolicyRecord {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly members?: SourceCallMemberProvider;
  readonly callable?: SourceCallCallablePolicy;
  readonly mapCall?: CsharpJsSurfaceSourceLibraryPolicy["mapCall"];
}

type SourceCallMemberProvider =
  | { readonly kind: "metadata-by-source-name"; readonly membersForSourceName: (sourceName: string) => readonly TargetMember[] }
  | { readonly kind: "date-call-kind" }
  | { readonly kind: "object-composite" }
  | { readonly kind: "array-carrier" }
  | { readonly kind: "collection-carrier" };

type SourceCallCallablePolicy =
  | { readonly kind: "members-exist" }
  | { readonly kind: "array-members-or-call-surface" }
  | { readonly kind: "collection-members-exist" }
  | { readonly kind: "always" }
  | { readonly kind: "never" };

const sourceCallPolicyRecords: readonly SourceCallPolicyRecord[] = [
  metadataPolicy({ prefixes: ["Math."] }, mathTargetMembersForSourceName),
  metadataPolicy({ prefixes: ["String."] }, stringTargetMembersForSourceName),
  metadataPolicy({ prefixes: ["Number."] }, numberTargetMembersForSourceName),
  metadataPolicy({ prefixes: ["Boolean."] }, booleanTargetMembersForSourceName),
  metadataPolicy({ prefixes: ["RegExp."] }, regExpTargetMembersForSourceName),
  {
    identity: { prefixes: ["Date."] },
    members: { kind: "date-call-kind" },
    callable: { kind: "members-exist" },
  },
  metadataPolicy({ prefixes: ["JSON."] }, jsonTargetMembersForSourceName),
  {
    identity: { prefixes: ["Object."] },
    members: { kind: "object-composite" },
    callable: { kind: "members-exist" },
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    members: { kind: "array-carrier" },
    callable: { kind: "array-members-or-call-surface" },
  },
  {
    identity: collectionIdentityPolicy,
    members: { kind: "collection-carrier" },
    callable: { kind: "collection-members-exist" },
  },
  {
    identity: { prefixes: ["Console."] },
    mapCall: mapCsharpJsConsoleCheckedCall,
    callable: { kind: "always" },
  },
  {
    identity: { prefixes: ["Promise."] },
    callable: { kind: "never" },
  },
];

export function getCsharpJsSourceLibraryCallMembersFromProviders(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const policy = resolveSourceCallPolicy(sourceMember);
  return policy?.members === undefined
    ? []
    : callMembersFromProvider(policy.members, sourceMember, request, context, host);
}

export function csharpJsSourceLibraryMemberHasCallableProvider(
  sourceMember: SourceLibraryMember,
): boolean {
  const policy = resolveSourceCallPolicy(sourceMember);
  return policy?.callable === undefined
    ? false
    : callablePolicyIsSatisfied(policy.callable, policy.members, sourceMember);
}

export function mapCsharpJsSourceLibraryProviderCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" },
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  return resolveSourceCallPolicy(sourceMember)?.mapCall?.(request, context, sourceMember, host, options);
}

function resolveSourceCallPolicy(sourceMember: SourceLibraryMember): SourceCallPolicyRecord | undefined {
  return sourceCallPolicyRecords.find((record) => sourceLibraryMemberMatches(sourceMember, record.identity));
}

function callMembersFromProvider(
  provider: SourceCallMemberProvider,
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const sourceName = sourceLibraryMemberName(sourceMember);
  switch (provider.kind) {
    case "metadata-by-source-name":
      return provider.membersForSourceName(sourceName);
    case "date-call-kind":
      return dateTargetMembersForSourceName(sourceName, isNewExpression(request.call, context) ? "new" : "call");
    case "object-composite":
      return [
        ...objectTargetMembersForSourceName(sourceName),
        ...getObjectPrimitiveReceiverCallMembers(request, context, host, sourceMember),
        ...getObjectRecordDictionaryCallMembers(sourceMember, request, context, host),
      ];
    case "array-carrier":
      return arrayMembersFromClosedFacts(sourceMember, sourceName, request, context, host);
    case "collection-carrier":
      return collectionTargetMembersForSourceMember(
        sourceMember,
        getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
        sourceLibraryMemberMatches(sourceMember, collectionConstructorIdentityPolicy)
          ? getSourceLibraryCallResultTargetType(request, context, host)
          : undefined,
      );
  }
}

function callablePolicyIsSatisfied(
  policy: SourceCallCallablePolicy,
  provider: SourceCallMemberProvider | undefined,
  sourceMember: SourceLibraryMember,
): boolean {
  const sourceName = sourceLibraryMemberName(sourceMember);
  switch (policy.kind) {
    case "members-exist":
      return provider === undefined ? false : callableMembersFromProvider(provider, sourceName).length > 0;
    case "array-members-or-call-surface":
      return arrayTargetMembersForSourceName(sourceName).length > 0 || arrayCallSurfaceMemberNames.has(sourceName);
    case "collection-members-exist":
      return collectionTargetMembersForSourceMember(sourceMember, undefined, undefined).length > 0;
    case "always":
      return true;
    case "never":
      return false;
  }
}

function callableMembersFromProvider(
  provider: SourceCallMemberProvider,
  sourceName: string,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-by-source-name":
      return provider.membersForSourceName(sourceName);
    case "date-call-kind":
      return dateTargetMembersForSourceName(sourceName, "call");
    case "object-composite":
      return objectTargetMembersForSourceName(sourceName);
    case "array-carrier":
    case "collection-carrier":
      return [];
  }
}

function arrayMembersFromClosedFacts(
  sourceMember: SourceLibraryMember,
  sourceName: string,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
  if (sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy) && resultElementType === undefined) {
    return [];
  }
  return arrayTargetMembersForSourceName(sourceName, resultElementType ?? arrayElementTypeFromClosedFacts(request, context, host));
}

function arrayElementTypeFromClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host)) ??
    getSourceLibraryCallReceiverElementType(request, context, host) ??
    getSourceLibraryCallArgumentTargetTypes(request, context, host).map(getCsharpArrayLikeElementType).find((element) => element !== undefined);
}

function metadataPolicy(
  identity: SourceLibraryMemberIdentityPolicy,
  membersForSourceName: (sourceName: string) => readonly TargetMember[],
): SourceCallPolicyRecord {
  return {
    identity,
    members: { kind: "metadata-by-source-name", membersForSourceName },
    callable: { kind: "members-exist" },
  };
}
