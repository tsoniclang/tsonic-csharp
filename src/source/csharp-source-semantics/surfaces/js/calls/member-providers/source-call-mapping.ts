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
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
  collectionIdentityPolicy,
  objectToStringIdentityPolicy,
} from "./identities.js";
import {
  type ObjectRecordDictionaryOperation,
  getObjectPrimitiveReceiverCallMembers,
  getObjectRecordDictionaryCallMembers,
  objectRecordDictionaryCallRows,
} from "./object-members.js";

interface JsSurfaceOperationRow {
  readonly identity: JsSurfaceSourceIdentitySelector;
  readonly policyKind: JsSurfaceOperationPolicyKind;
  readonly targetProviders?: readonly JsSurfaceOperationTargetProvider[];
  readonly semanticException?: JsSurfaceOperationSemanticException;
  readonly callableWithoutContext?: boolean;
}

type JsSurfaceOperationPolicyKind =
  | "provider-member"
  | "carrier-member"
  | "semantic-exception"
  | "unsupported";

type JsSurfaceOperationTargetProvider =
  | {
    readonly kind: "metadata-index";
    readonly membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>;
  }
  | {
    readonly kind: "operation-adapter";
    readonly adapter: JsSurfaceOperationTargetProviderAdapter;
  };

interface JsSurfaceOperationTargetProviderAdapter {
  readonly id: string;
  readonly selectTargetMembers: (request: JsSurfaceCallTargetProviderRequest) => readonly TargetMember[];
  readonly hasCallableProvider: (request: JsSurfaceCallCallableProviderRequest) => boolean;
}

interface JsSurfaceOperationSemanticException {
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

const jsSurfaceOperationRows: readonly JsSurfaceOperationRow[] = [
  operationRowFromMetadataIndex({ prefixes: ["Math."] }, mathTargetMemberIdentityIndex),
  operationRowFromMetadataIndex({ prefixes: ["String."] }, stringTargetMemberIdentityIndex),
  operationRowFromMetadataIndex({ prefixes: ["Number."] }, numberTargetMemberIdentityIndex),
  operationRowFromMetadataIndex({ prefixes: ["Boolean."] }, booleanTargetMemberIdentityIndex),
  operationRowFromMetadataIndex({ prefixes: ["RegExp."] }, regExpTargetMemberIdentityIndex),
  {
    identity: { prefixes: ["Date."] },
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Date call and construct source operations have different JavaScript runtime semantics but share the Date source family.",
      requiredFacts: ["selected source declaration/signature identity", "call expression construct-vs-call shape"],
    },
    targetProviders: [operationAdapterProvider(callConstructDiscriminatorProvider())],
  },
  operationRowFromMetadataIndex({ prefixes: ["JSON."] }, jsonTargetMemberIdentityIndex),
  {
    identity: objectToStringIdentityPolicy,
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Object.prototype.toString delegates primitive receivers to selected JS wrapper surface members.",
      requiredFacts: ["selected source declaration/signature identity", "resolved primitive receiver carrier"],
    },
    targetProviders: [operationAdapterProvider(primitiveReceiverStaticHelperProvider())],
  },
  ...objectRecordDictionaryCallRows.map((row): JsSurfaceOperationRow => ({
    identity: row.identity,
    policyKind: "carrier-member",
    targetProviders: [
      metadataIndexProvider(objectTargetMemberIdentityIndex),
      operationAdapterProvider(recordDictionaryStaticHelperProvider(row.operation)),
    ],
  })),
  operationRowFromMetadataIndex({ prefixes: ["Object."] }, objectTargetMemberIdentityIndex),
  {
    identity: arrayConstructorIdentityPolicy,
    policyKind: "carrier-member",
    callableWithoutContext: true,
    targetProviders: [operationAdapterProvider(closedSequenceCarrierProvider({ requireResultElementType: true }))],
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    policyKind: "carrier-member",
    targetProviders: [operationAdapterProvider(closedSequenceCarrierProvider({ requireResultElementType: false }))],
  },
  {
    identity: collectionConstructorIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [operationAdapterProvider(closedKeyedCollectionCarrierProvider({ useResultCarrier: true }))],
  },
  {
    identity: collectionIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [operationAdapterProvider(closedKeyedCollectionCarrierProvider({ useResultCarrier: false }))],
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

function sourceCallMetadataRowForSourceMember(sourceMember: SourceLibraryMember): JsSurfaceOperationRow | undefined {
  return jsSurfaceSelectMetadataRowForSourceIdentity(
    jsSurfaceOperationRows,
    jsSurfaceSelectedSourceIdentityForMember(sourceMember),
  );
}

function callMembersFromOperationRow(
  row: JsSurfaceOperationRow,
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
  row: JsSurfaceOperationRow,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  if (row.callableWithoutContext === true) {
    return true;
  }
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
  provider: JsSurfaceOperationTargetProvider,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity);
    case "operation-adapter":
      return provider.adapter.selectTargetMembers(request);
  }
}

function providerHasCallableMember(
  provider: JsSurfaceOperationTargetProvider,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity).some(targetMemberIsCallable);
    case "operation-adapter":
      return provider.adapter.hasCallableProvider(request);
  }
}

function arrayMembersFromClosedFacts(
  sourceMember: SourceLibraryMember,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  options: {
    readonly requireResultElementType: boolean;
  },
): readonly TargetMember[] {
  const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
  if (options.requireResultElementType && resultElementType === undefined) {
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

function operationRowFromMetadataIndex(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfaceOperationRow {
  return {
    identity,
    policyKind: "provider-member",
    targetProviders: [metadataIndexProvider(membersBySourceIdentity)],
  };
}

function metadataIndexProvider(
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "metadata-index",
    membersBySourceIdentity,
  };
}

function operationAdapterProvider(adapter: JsSurfaceOperationTargetProviderAdapter): JsSurfaceOperationTargetProvider {
  return {
    kind: "operation-adapter",
    adapter,
  };
}

function callConstructDiscriminatorProvider(): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "call-construct-discriminator",
    selectTargetMembers: (request) =>
      dateTargetMembersForSourceMember(request.sourceMember, isNewExpression(request.request.call, request.context) ? "new" : "call"),
    hasCallableProvider: (request) => dateTargetMembersForSourceMember(request.sourceMember, "call").some(targetMemberIsCallable),
  };
}

function primitiveReceiverStaticHelperProvider(): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "primitive-receiver-static-helper",
    selectTargetMembers: (request) => getObjectPrimitiveReceiverCallMembers(request.request, request.context, request.host),
    hasCallableProvider: () => false,
  };
}

function recordDictionaryStaticHelperProvider(operation: ObjectRecordDictionaryOperation): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "record-dictionary-static-helper",
    selectTargetMembers: (request) => getObjectRecordDictionaryCallMembers(operation, request.request, request.context, request.host),
    hasCallableProvider: () => false,
  };
}

function closedSequenceCarrierProvider(options: { readonly requireResultElementType: boolean }): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "closed-sequence-carrier",
    selectTargetMembers: (request) => arrayMembersFromClosedFacts(request.sourceMember, request.request, request.context, request.host, options),
    hasCallableProvider: (request) =>
      arrayTargetMembersForSourceMember(request.sourceMember).some(targetMemberIsCallable),
  };
}

function closedKeyedCollectionCarrierProvider(options: { readonly useResultCarrier: boolean }): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "closed-keyed-collection-carrier",
    selectTargetMembers: (request) =>
      collectionTargetMembersForSourceMember(
        request.sourceMember,
        getSourceLibraryCallReceiverTargetTypes(request.request, request.context, request.host)[0],
        options.useResultCarrier
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
