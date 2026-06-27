import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  arrayTargetMembersForSourceMember,
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
} from "../../arrays.js";
import {
  collectionTargetMembersForSourceMember,
} from "../../collections.js";
import {
  dateTargetMembersForSourceMember,
} from "../../date/index.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
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
import type {
  ObjectRecordDictionaryOperation,
} from "./object-members.js";
import {
  getObjectPrimitiveReceiverCallMembers,
  getObjectRecordDictionaryCallMembers,
} from "./object-members.js";
import type {
  JsSurfaceOperationRow,
  JsSurfaceOperationTargetProvider,
  JsSurfaceOperationTargetProviderAdapter,
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

export function operationAdapterProvider(
  adapter: JsSurfaceOperationTargetProviderAdapter,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "operation-adapter",
    adapter,
  };
}

export function callConstructDiscriminatorProvider(): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "call-construct-discriminator",
    selectTargetMembers: (request) =>
      dateTargetMembersForSourceMember(request.sourceMember, isNewExpression(request.request.call, request.context) ? "new" : "call"),
    hasCallableProvider: (request) => dateTargetMembersForSourceMember(request.sourceMember, "call").some(jsSurfaceTargetMemberIsCallable),
  };
}

export function primitiveReceiverStaticHelperProvider(): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "primitive-receiver-static-helper",
    selectTargetMembers: (request) => getObjectPrimitiveReceiverCallMembers(request.request, request.context, request.host),
    hasCallableProvider: () => false,
  };
}

export function recordDictionaryStaticHelperProvider(
  operation: ObjectRecordDictionaryOperation,
): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "record-dictionary-static-helper",
    selectTargetMembers: (request) => getObjectRecordDictionaryCallMembers(operation, request.request, request.context, request.host),
    hasCallableProvider: () => false,
  };
}

export function closedSequenceCarrierProvider(
  options: { readonly requireResultElementType: boolean },
): JsSurfaceOperationTargetProviderAdapter {
  return {
    id: "closed-sequence-carrier",
    selectTargetMembers: (request) => arrayMembersFromClosedFacts(request.sourceMember, request.request, request.context, request.host, options),
    hasCallableProvider: (request) =>
      arrayTargetMembersForSourceMember(request.sourceMember).some(jsSurfaceTargetMemberIsCallable),
  };
}

export function closedKeyedCollectionCarrierProvider(
  options: { readonly useResultCarrier: boolean },
): JsSurfaceOperationTargetProviderAdapter {
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
      collectionTargetMembersForSourceMember(request.sourceMember, undefined, undefined).some(jsSurfaceTargetMemberIsCallable),
  };
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
