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
  booleanTargetMemberIdentityIndex,
} from "../../booleans.js";
import {
  consoleTargetMembersBySourceIdentity,
} from "../../console.js";
import {
  collectionTargetMembersForSourceMember,
} from "../../collections.js";
import {
  dateTargetMembersForSourceMember,
} from "../../date/index.js";
import {
  jsonTargetMemberIdentityIndex,
} from "../../json.js";
import {
  mathTargetMemberIdentityIndex,
} from "../../math.js";
import {
  numberTargetMemberIdentityIndex,
} from "../../numbers.js";
import {
  objectTargetMembersForSourceMember,
} from "../../objects.js";
import {
  regExpTargetMemberIdentityIndex,
} from "../../regexp/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberKey,
} from "../../source-library.js";
import {
  type JsSurfaceSelectedSourceIdentity,
  type JsSurfaceSourceIdentitySelector,
  jsSurfaceSelectMetadataRowForSourceIdentity,
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceSourceIdentityMatchesSelector,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  stringTargetMemberIdentityIndex,
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
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly members?: SourceCallMemberProvider;
  readonly callable?: SourceCallCallablePolicy;
}

type SourceCallMemberProvider =
  | { readonly kind: "metadata-index"; readonly membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]> }
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

const sourceCallMetadataRows: readonly SourceCallMetadataRow[] = [
  metadataIndexPolicy({ prefixes: ["Math."] }, mathTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["String."] }, stringTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["Number."] }, numberTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["Boolean."] }, booleanTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["RegExp."] }, regExpTargetMemberIdentityIndex),
  {
    identity: { prefixes: ["Date."] },
    members: { kind: "date-call-kind" },
    callable: { kind: "members-exist" },
  },
  metadataIndexPolicy({ prefixes: ["JSON."] }, jsonTargetMemberIdentityIndex),
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
    members: { kind: "metadata-index", membersBySourceIdentity: consoleTargetMembersBySourceIdentity },
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
    : callMembersFromProvider(
        policy.members,
        sourceMember,
        jsSurfaceSelectedSourceIdentityForMember(sourceMember),
        request,
        context,
        host,
      );
}

export function csharpJsSourceLibraryMemberHasCallableProvider(
  sourceMember: SourceLibraryMember,
): boolean {
  const policy = sourceCallMetadataRowForSourceMember(sourceMember);
  return policy?.callable === undefined
    ? false
    : callablePolicyIsSatisfied(
        policy.callable,
        policy.members,
        sourceMember,
        jsSurfaceSelectedSourceIdentityForMember(sourceMember),
      );
}

function sourceCallMetadataRowForSourceMember(sourceMember: SourceLibraryMember): SourceCallMetadataRow | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    sourceCallMetadataRows,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
  );
}

function callMembersFromProvider(
  provider: SourceCallMemberProvider,
  sourceMember: SourceLibraryMember,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, selectedIdentity);
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
        jsSurfaceSourceIdentityMatchesSelector(selectedIdentity, collectionConstructorIdentityPolicy)
          ? getSourceLibraryCallResultTargetType(request, context, host)
          : undefined,
      );
  }
}

function callablePolicyIsSatisfied(
  policy: SourceCallCallablePolicy,
  provider: SourceCallMemberProvider | undefined,
  sourceMember: SourceLibraryMember,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): boolean {
  switch (policy.kind) {
    case "members-exist":
      return provider === undefined ? false : callableMembersFromProvider(provider, sourceMember, selectedIdentity).length > 0;
    case "array-members-or-call-surface":
      return arrayTargetMembersForSourceMember(sourceMember).length > 0 ||
        jsSurfaceSourceIdentityMatchesSelector(selectedIdentity, arrayCallableIdentityPolicy);
    case "collection-members-exist":
      return hasCallableTargetMember(collectionTargetMembersForSourceMember(sourceMember, undefined, undefined));
    case "always":
      return true;
    case "never":
      return false;
  }
}

function callableMembersFromProvider(
  provider: SourceCallMemberProvider,
  sourceMember: SourceLibraryMember,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  const members = (() => {
    switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, selectedIdentity);
    case "date-call-kind":
      return dateTargetMembersForSourceMember(sourceMember, "call");
    case "object-composite":
      return objectTargetMembersForSourceMember(sourceMember);
    case "array-carrier":
    case "collection-carrier":
      return [];
    }
  })();
  return members.filter(targetMemberIsCallable);
}

function hasCallableTargetMember(members: readonly TargetMember[]): boolean {
  return members.some(targetMemberIsCallable);
}

function targetMemberIsCallable(member: TargetMember): boolean {
  return member.kind !== "property";
}

function arrayMembersFromClosedFacts(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
  if (
    jsSurfaceSourceIdentityMatchesSelector(jsSurfaceSelectedSourceIdentityForMember(sourceMember), arrayConstructorIdentityPolicy) &&
    resultElementType === undefined
  ) {
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

function metadataIndexPolicy(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): SourceCallMetadataRow {
  return {
    identity,
    members: { kind: "metadata-index", membersBySourceIdentity },
    callable: { kind: "members-exist" },
  };
}
