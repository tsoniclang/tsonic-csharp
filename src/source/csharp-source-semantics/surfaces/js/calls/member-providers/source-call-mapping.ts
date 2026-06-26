import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
  arrayTargetMembersForSourceMember,
} from "../../arrays.js";
import {
  booleanTargetMembersForSourceMember,
} from "../../booleans.js";
import {
  consoleTargetMembersForSourceMember,
} from "../../console.js";
import {
  collectionTargetMembersForSourceMember,
} from "../../collections.js";
import {
  dateTargetMembersForSourceMember,
} from "../../date/index.js";
import {
  jsonTargetMembersForSourceMember,
} from "../../json.js";
import {
  mathTargetMembersForSourceMember,
} from "../../math.js";
import {
  numberTargetMembersForSourceMember,
} from "../../numbers.js";
import {
  objectTargetMembersForSourceMember,
} from "../../objects.js";
import {
  regExpTargetMembersForSourceMember,
} from "../../regexp/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../../source-library.js";
import {
  sourceLibraryMemberMatches,
} from "../../source-library.js";
import {
  stringTargetMembersForSourceMember,
} from "../../strings.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverElementType,
  getSourceLibraryCallReceiverTargetTypes,
  getSourceLibraryCallResultTargetType,
  isNewExpression,
} from "../helpers.js";
import {
  arrayCallableIdentityPolicy,
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
  collectionIdentityPolicy,
} from "./identities.js";
import {
  getObjectPrimitiveReceiverCallMembers,
  getObjectRecordDictionaryCallMembers,
} from "./object-members.js";

interface SourceCallMetadataRow {
  readonly identity: SourceLibraryMemberIdentityPolicy;
  readonly members?: SourceCallMemberProvider;
  readonly callable?: SourceCallCallablePolicy;
}

type SourceCallMemberProvider =
  | { readonly kind: "metadata-by-source-identity"; readonly membersForSourceMember: (sourceMember: SourceLibraryMember) => readonly TargetMember[] }
  | { readonly kind: "date-call-kind" }
  | { readonly kind: "object-composite" }
  | { readonly kind: "array-carrier" }
  | { readonly kind: "collection-carrier" }
  | { readonly kind: "console-metadata" };

type SourceCallCallablePolicy =
  | { readonly kind: "members-exist" }
  | { readonly kind: "array-members-or-call-surface" }
  | { readonly kind: "collection-members-exist" }
  | { readonly kind: "always" }
  | { readonly kind: "never" };

const sourceCallMetadataRows: readonly SourceCallMetadataRow[] = [
  metadataPolicy({ prefixes: ["Math."] }, mathTargetMembersForSourceMember),
  metadataPolicy({ prefixes: ["String."] }, stringTargetMembersForSourceMember),
  metadataPolicy({ prefixes: ["Number."] }, numberTargetMembersForSourceMember),
  metadataPolicy({ prefixes: ["Boolean."] }, booleanTargetMembersForSourceMember),
  metadataPolicy({ prefixes: ["RegExp."] }, regExpTargetMembersForSourceMember),
  {
    identity: { prefixes: ["Date."] },
    members: { kind: "date-call-kind" },
    callable: { kind: "members-exist" },
  },
  metadataPolicy({ prefixes: ["JSON."] }, jsonTargetMembersForSourceMember),
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
    members: { kind: "console-metadata" },
    callable: { kind: "members-exist" },
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
  const policy = sourceCallMetadataRowForSourceMember(sourceMember);
  return policy?.members === undefined
    ? []
    : callMembersFromProvider(policy.members, sourceMember, request, context, host);
}

export function csharpJsSourceLibraryMemberHasCallableProvider(
  sourceMember: SourceLibraryMember,
): boolean {
  const policy = sourceCallMetadataRowForSourceMember(sourceMember);
  return policy?.callable === undefined
    ? false
    : callablePolicyIsSatisfied(policy.callable, policy.members, sourceMember);
}

function sourceCallMetadataRowForSourceMember(sourceMember: SourceLibraryMember): SourceCallMetadataRow | undefined {
  return sourceCallMetadataRows.find((record) => sourceLibraryMemberMatches(sourceMember, record.identity));
}

function callMembersFromProvider(
  provider: SourceCallMemberProvider,
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-by-source-identity":
      return provider.membersForSourceMember(sourceMember);
    case "date-call-kind":
      return dateTargetMembersForSourceMember(sourceMember, isNewExpression(request.call, context) ? "new" : "call");
    case "object-composite":
      return [
        ...objectTargetMembersForSourceMember(sourceMember),
        ...getObjectPrimitiveReceiverCallMembers(request, context, host, sourceMember),
        ...getObjectRecordDictionaryCallMembers(sourceMember, request, context, host),
      ];
    case "array-carrier":
      return arrayMembersFromClosedFacts(sourceMember, request, context, host);
    case "collection-carrier":
      return collectionTargetMembersForSourceMember(
        sourceMember,
        getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
        sourceLibraryMemberMatches(sourceMember, collectionConstructorIdentityPolicy)
          ? getSourceLibraryCallResultTargetType(request, context, host)
          : undefined,
      );
    case "console-metadata":
      return consoleTargetMembersForSourceMember(sourceMember);
  }
}

function callablePolicyIsSatisfied(
  policy: SourceCallCallablePolicy,
  provider: SourceCallMemberProvider | undefined,
  sourceMember: SourceLibraryMember,
): boolean {
  switch (policy.kind) {
    case "members-exist":
      return provider === undefined ? false : callableMembersFromProvider(provider, sourceMember).length > 0;
    case "array-members-or-call-surface":
      return arrayTargetMembersForSourceMember(sourceMember).length > 0 || sourceLibraryMemberMatches(sourceMember, arrayCallableIdentityPolicy);
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
  sourceMember: SourceLibraryMember,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-by-source-identity":
      return provider.membersForSourceMember(sourceMember);
    case "date-call-kind":
      return dateTargetMembersForSourceMember(sourceMember, "call");
    case "object-composite":
      return objectTargetMembersForSourceMember(sourceMember);
    case "array-carrier":
    case "collection-carrier":
      return [];
    case "console-metadata":
      return consoleTargetMembersForSourceMember(sourceMember);
  }
}

function arrayMembersFromClosedFacts(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
  if (sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy) && resultElementType === undefined) {
    return [];
  }
  return arrayTargetMembersForSourceMember(sourceMember, resultElementType ?? arrayElementTypeFromClosedFacts(request, context, host));
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
  membersForSourceMember: (sourceMember: SourceLibraryMember) => readonly TargetMember[],
): SourceCallMetadataRow {
  return {
    identity,
    members: { kind: "metadata-by-source-identity", membersForSourceMember },
    callable: { kind: "members-exist" },
  };
}
