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
  CsharpJsSurfaceHost,
  SourceLibraryMemberKey,
} from "../../source-library.js";
import type {
  JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";
import {
  jsSurfaceTargetMembersForSelectedSourceIdentity,
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
  JsSurfaceCarrierMemberSelection,
  JsSurfaceCallCallableProviderRequest,
  JsSurfaceOperationRow,
  JsSurfaceOperationTargetProvider,
  JsSurfaceRuntimeHelperSelection,
  JsSurfaceSemanticExceptionSelection,
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

export function carrierMemberProvider(
  carrier: JsSurfaceCarrierMemberSelection,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "carrier-member",
    carrier,
  };
}

export function runtimeHelperProvider(
  helper: JsSurfaceRuntimeHelperSelection,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "runtime-helper",
    helper,
  };
}

export function semanticExceptionProvider(
  exception: JsSurfaceSemanticExceptionSelection,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "semantic-exception",
    exception,
  };
}

export function targetMembersFromOperationTargetProvider(
  provider: JsSurfaceOperationTargetProvider,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity);
    case "carrier-member":
      return targetMembersFromCarrierSelection(provider.carrier, request);
    case "runtime-helper":
      return targetMembersFromRuntimeHelperSelection(provider.helper, request);
    case "semantic-exception":
      return targetMembersFromSemanticException(provider.exception, request);
  }
}

export function operationTargetProviderHasCallableMember(
  provider: JsSurfaceOperationTargetProvider,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  switch (provider.kind) {
    case "metadata-index":
      return jsSurfaceTargetMembersForSelectedSourceIdentity(provider.membersBySourceIdentity, request.selectedIdentity).some(jsSurfaceTargetMemberIsCallable);
    case "carrier-member":
      return carrierSelectionHasCallableMember(provider.carrier, request);
    case "runtime-helper":
      return false;
    case "semantic-exception":
      return semanticExceptionHasCallableMember(provider.exception, request);
  }
}

function targetMembersFromCarrierSelection(
  selection: JsSurfaceCarrierMemberSelection,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (selection.kind) {
    case "sequence":
      return arrayMembersFromClosedFacts(request, selection);
    case "keyed-collection":
      return collectionTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        getSourceLibraryCallReceiverTargetTypes(request.request, request.context, request.host)[0],
        selection.useResultCarrier
          ? getSourceLibraryCallResultTargetType(request.request, request.context, request.host)
          : undefined,
      );
  }
}

function targetMembersFromRuntimeHelperSelection(
  selection: JsSurfaceRuntimeHelperSelection,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (selection.kind) {
    case "record-dictionary":
      return getObjectRecordDictionaryCallMembers(selection.operation, request.request, request.context, request.host);
  }
}

function targetMembersFromSemanticException(
  selection: JsSurfaceSemanticExceptionSelection,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (selection.kind) {
    case "date-call-construct":
      return dateTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        isNewExpression(request.request.call, request.context) ? "new" : "call",
      );
    case "object-primitive-receiver-to-string":
      return getObjectPrimitiveReceiverCallMembers(request.request, request.context, request.host);
  }
}

function carrierSelectionHasCallableMember(
  selection: JsSurfaceCarrierMemberSelection,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  switch (selection.kind) {
    case "sequence":
      return arrayTargetMembersForSelectedIdentity(request.selectedIdentity).some(jsSurfaceTargetMemberIsCallable);
    case "keyed-collection":
      return collectionTargetMembersForSelectedIdentity(request.selectedIdentity, undefined, undefined).some(jsSurfaceTargetMemberIsCallable);
  }
}

function semanticExceptionHasCallableMember(
  selection: JsSurfaceSemanticExceptionSelection,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  switch (selection.kind) {
    case "date-call-construct":
      return dateTargetMembersForSelectedIdentity(request.selectedIdentity, "call").some(jsSurfaceTargetMemberIsCallable);
    case "object-primitive-receiver-to-string":
      return false;
  }
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
