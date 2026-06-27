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
  objectTargetMemberIdentityIndex,
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
  readonly policyKind: JsSurfaceCallPolicyKind;
  readonly targetProviders?: readonly JsSurfaceCallTargetProvider[];
  readonly semanticException?: JsSurfaceCallSemanticException;
}

type JsSurfaceCallPolicyKind =
  | "provider-member"
  | "carrier-member"
  | "semantic-exception"
  | "unsupported";

type JsSurfaceCallTargetProvider =
  | {
    readonly kind: "metadata-index";
    readonly membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>;
  }
  | {
    readonly kind: "adapter";
    readonly adapter: JsSurfaceCallTargetProviderAdapter;
  };

interface JsSurfaceCallTargetProviderAdapter {
  readonly id: string;
  readonly selectTargetMembers: (request: JsSurfaceCallTargetProviderRequest) => readonly TargetMember[];
  readonly hasCallableProvider: (request: JsSurfaceCallCallableProviderRequest) => boolean;
}

interface JsSurfaceCallSemanticException {
  readonly reason: string;
  readonly requiredFacts: readonly string[];
}

interface JsSurfaceCallTargetProviderRequest {
  readonly sourceMember: SourceLibraryMember;
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
  readonly request: CheckedCallMappingRequest;
  readonly context: ExtensionObservationContext<"operation.mapCheckedCall">;
  readonly host: CsharpJsSurfaceHost;
}

interface JsSurfaceCallCallableProviderRequest {
  readonly sourceMember: SourceLibraryMember;
  readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
}

const sourceCallMetadataRows: readonly SourceCallMetadataRow[] = [
  metadataIndexPolicy({ prefixes: ["Math."] }, mathTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["String."] }, stringTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["Number."] }, numberTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["Boolean."] }, booleanTargetMemberIdentityIndex),
  metadataIndexPolicy({ prefixes: ["RegExp."] }, regExpTargetMemberIdentityIndex),
  {
    identity: { prefixes: ["Date."] },
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Date call and construct source operations have different JavaScript runtime semantics but share the Date source family.",
      requiredFacts: ["selected source declaration/signature identity", "call expression construct-vs-call shape"],
    },
    targetProviders: [adapterProvider(callConstructDiscriminatorProvider())],
  },
  metadataIndexPolicy({ prefixes: ["JSON."] }, jsonTargetMemberIdentityIndex),
  {
    identity: { prefixes: ["Object."] },
    policyKind: "carrier-member",
    targetProviders: [
      metadataIndexProvider(objectTargetMemberIdentityIndex),
      adapterProvider(primitiveReceiverStaticHelperProvider()),
      adapterProvider(recordDictionaryStaticHelperProvider()),
    ],
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    policyKind: "carrier-member",
    targetProviders: [adapterProvider(closedSequenceCarrierProvider())],
  },
  {
    identity: collectionIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [adapterProvider(closedKeyedCollectionCarrierProvider())],
  },
  {
    identity: { prefixes: ["Console."] },
    policyKind: "provider-member",
    targetProviders: [metadataIndexProvider(consoleTargetMembersBySourceIdentity)],
  },
  {
    identity: { prefixes: ["Promise."] },
    policyKind: "unsupported",
  },
];

export function getCsharpJsSourceLibraryCallMembersFromProviders(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const row = sourceCallMetadataRowForSourceMember(sourceMember);
  return row === undefined || row.policyKind === "unsupported"
    ? []
    : callMembersFromOperationRow(
        row,
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
  const row = sourceCallMetadataRowForSourceMember(sourceMember);
  return row === undefined
    ? false
    : operationRowHasCallableProvider(row, {
      sourceMember,
      selectedIdentity: jsSurfaceSelectedSourceIdentityForMember(sourceMember),
    });
}

function sourceCallMetadataRowForSourceMember(sourceMember: SourceLibraryMember): SourceCallMetadataRow | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    sourceCallMetadataRows,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
  );
}

function callMembersFromOperationRow(
  row: SourceCallMetadataRow,
  sourceMember: SourceLibraryMember,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly TargetMember[] {
  const providerRequest = { sourceMember, selectedIdentity, request, context, host } satisfies JsSurfaceCallTargetProviderRequest;
  return (row.targetProviders ?? []).flatMap((provider) => targetMembersFromProvider(provider, providerRequest));
}

function operationRowHasCallableProvider(
  row: SourceCallMetadataRow,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  switch (row.policyKind) {
    case "unsupported":
      return false;
    case "provider-member":
    case "carrier-member":
    case "semantic-exception":
      return (row.targetProviders ?? []).some((provider) => providerHasCallableMember(provider, request));
  }
}

function targetMembersFromProvider(
  provider: JsSurfaceCallTargetProvider,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity);
    case "adapter":
      return provider.adapter.selectTargetMembers(request);
  }
}

function providerHasCallableMember(
  provider: JsSurfaceCallTargetProvider,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity).some(targetMemberIsCallable);
    case "adapter":
      return provider.adapter.hasCallableProvider(request);
  }
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
    policyKind: "provider-member",
    targetProviders: [metadataIndexProvider(membersBySourceIdentity)],
  };
}

function metadataIndexProvider(
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfaceCallTargetProvider {
  return {
    kind: "metadata-index",
    membersBySourceIdentity,
  };
}

function adapterProvider(adapter: JsSurfaceCallTargetProviderAdapter): JsSurfaceCallTargetProvider {
  return {
    kind: "adapter",
    adapter,
  };
}

function callConstructDiscriminatorProvider(): JsSurfaceCallTargetProviderAdapter {
  return {
    id: "call-construct-discriminator",
    selectTargetMembers: (request) =>
      dateTargetMembersForSourceMember(request.sourceMember, isNewExpression(request.request.call, request.context) ? "new" : "call"),
    hasCallableProvider: (request) => dateTargetMembersForSourceMember(request.sourceMember, "call").some(targetMemberIsCallable),
  };
}

function primitiveReceiverStaticHelperProvider(): JsSurfaceCallTargetProviderAdapter {
  return {
    id: "primitive-receiver-static-helper",
    selectTargetMembers: (request) => getObjectPrimitiveReceiverCallMembers(request.request, request.context, request.host, request.sourceMember),
    hasCallableProvider: () => false,
  };
}

function recordDictionaryStaticHelperProvider(): JsSurfaceCallTargetProviderAdapter {
  return {
    id: "record-dictionary-static-helper",
    selectTargetMembers: (request) => getObjectRecordDictionaryCallMembers(request.sourceMember, request.request, request.context, request.host),
    hasCallableProvider: () => false,
  };
}

function closedSequenceCarrierProvider(): JsSurfaceCallTargetProviderAdapter {
  return {
    id: "closed-sequence-carrier",
    selectTargetMembers: (request) => arrayMembersFromClosedFacts(request.sourceMember, request.request, request.context, request.host),
    hasCallableProvider: (request) =>
      arrayTargetMembersForSourceMember(request.sourceMember).some(targetMemberIsCallable) ||
      jsSurfaceSourceIdentityMatchesSelector(request.selectedIdentity, arrayCallableIdentityPolicy),
  };
}

function closedKeyedCollectionCarrierProvider(): JsSurfaceCallTargetProviderAdapter {
  return {
    id: "closed-keyed-collection-carrier",
    selectTargetMembers: (request) =>
      collectionTargetMembersForSourceMember(
        request.sourceMember,
        getSourceLibraryCallReceiverTargetTypes(request.request, request.context, request.host)[0],
        jsSurfaceSourceIdentityMatchesSelector(request.selectedIdentity, collectionConstructorIdentityPolicy)
          ? getSourceLibraryCallResultTargetType(request.request, request.context, request.host)
          : undefined,
      ),
    hasCallableProvider: (request) =>
      collectionTargetMembersForSourceMember(request.sourceMember, undefined, undefined).some(targetMemberIsCallable),
  };
}

function targetMemberIsCallable(member: TargetMember): boolean {
  return member.kind !== "property";
}
