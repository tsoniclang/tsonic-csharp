import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  arrayTargetMembersForSelectedIdentity,
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
} from "../../arrays.js";
import {
  collectionTargetMembersForSelectedIdentity,
} from "../../collections.js";
import {
  dateTargetMembersForSelectedIdentity,
} from "../../date/index.js";
import type {
  ObjectRecordDictionaryOperation,
} from "../../objects.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMemberKey,
} from "../../source-library.js";
import type {
  JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverElementType,
  getSourceLibraryCallReceiverTargetTypes,
  getSourceLibraryCallResultTargetType,
  isNewExpression,
} from "../helpers.js";
import {
  getObjectPrimitiveReceiverCallMembers,
  getObjectRecordDictionaryCallMembers,
} from "./object-members.js";
import type {
  JsSurfaceCallTargetProviderRequest,
  JsSurfaceOperationRow,
  JsSurfaceOperationTargetProvider,
  JsSurfaceOperationTargetProviderResolver,
} from "./operation-types.js";
import {
  jsSurfaceTargetMemberIsCallable,
} from "./operation-types.js";

export function operationRowFromMetadataIndex(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfaceOperationRow {
  return {
    identity,
    policyKind: "provider-member",
    targetProviders: [metadataIndexProvider(membersBySourceIdentity)],
  };
}

export function metadataIndexProvider(
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "metadata-index",
    membersBySourceIdentity,
  };
}

export function contextualMetadataProvider(
  resolver: JsSurfaceOperationTargetProviderResolver,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "contextual-metadata",
    resolver,
  };
}

export function semanticExceptionProvider(
  resolver: JsSurfaceOperationTargetProviderResolver,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "semantic-exception",
    resolver,
  };
}

export function callConstructDiscriminatorProvider(): JsSurfaceOperationTargetProviderResolver {
  return {
    id: "call-construct-discriminator",
    selectTargetMembers: (request) =>
      dateTargetMembersForSelectedIdentity(request.selectedIdentity, isNewExpression(request.request.call, request.context) ? "new" : "call"),
    hasCallableProvider: (request) => dateTargetMembersForSelectedIdentity(request.selectedIdentity, "call").some(jsSurfaceTargetMemberIsCallable),
  };
}

export function primitiveReceiverStaticHelperProvider(): JsSurfaceOperationTargetProviderResolver {
  return {
    id: "primitive-receiver-static-helper",
    selectTargetMembers: (request) => getObjectPrimitiveReceiverCallMembers(request.request, request.context, request.host),
    hasCallableProvider: () => false,
  };
}

export function recordDictionaryStaticHelperProvider(
  operation: ObjectRecordDictionaryOperation,
): JsSurfaceOperationTargetProviderResolver {
  return {
    id: "record-dictionary-static-helper",
    selectTargetMembers: (request) => getObjectRecordDictionaryCallMembers(operation, request.request, request.context, request.host),
    hasCallableProvider: () => false,
  };
}

export function closedSequenceCarrierProvider(
  options: { readonly requireResultElementType: boolean },
): JsSurfaceOperationTargetProviderResolver {
  return {
    id: "closed-sequence-target-metadata",
    selectTargetMembers: (request) => arrayMembersFromClosedFacts(request, options),
    hasCallableProvider: (request) =>
      arrayTargetMembersForSelectedIdentity(request.selectedIdentity).some(jsSurfaceTargetMemberIsCallable),
  };
}

export function closedKeyedCollectionCarrierProvider(
  options: { readonly useResultCarrier: boolean },
): JsSurfaceOperationTargetProviderResolver {
  return {
    id: "closed-keyed-collection-target-metadata",
    selectTargetMembers: (request) =>
      collectionTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        getSourceLibraryCallReceiverTargetTypes(request.request, request.context, request.host)[0],
        options.useResultCarrier
          ? getSourceLibraryCallResultTargetType(request.request, request.context, request.host)
          : undefined,
      ),
    hasCallableProvider: (request) =>
      collectionTargetMembersForSelectedIdentity(request.selectedIdentity, undefined, undefined).some(jsSurfaceTargetMemberIsCallable),
  };
}

function arrayMembersFromClosedFacts(
  providerRequest: JsSurfaceCallTargetProviderRequest,
  options: {
    readonly requireResultElementType: boolean;
  },
): readonly TargetMember[] {
  const { request, context, host } = providerRequest;
  const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
  if (options.requireResultElementType && resultElementType === undefined) {
    return [];
  }
  return arrayTargetMembersForSelectedIdentity(providerRequest.selectedIdentity, resultElementType ?? arrayElementTypeFromClosedFacts(request, context, host));
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
