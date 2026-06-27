import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  booleanConstructorTargetMembersForSelectedIdentity,
} from "../../booleans.js";
import {
  numberConstructorTargetMembersForSelectedIdentity,
} from "../../numbers.js";
import {
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
} from "../../arrays.js";
import {
  dateTargetMembersForSelectedIdentity,
} from "../../date/index.js";
import {
  jsonRecordDictionaryStringifyTargetMembers,
} from "../../json.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../../../dictionaries.js";
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
  jsSurfaceSelectedTargetMembersForSelectedIdentity,
} from "../../selected-target-member-metadata.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverElementType,
  getSourceLibraryCallReceiverTargetTypes,
  getSourceLibraryCallResultTargetType,
  isStringKeyedRecordDictionaryTargetType,
  isNewExpression,
} from "../helpers.js";
import {
  getObjectPrimitiveReceiverCallMembers,
  getObjectRecordDictionaryCallMembers,
} from "./object-members.js";
import type {
  JsSurfaceCallTargetProviderRequest,
  JsSurfaceCallCallableProviderRequest,
  JsSurfaceOperationRow,
  JsSurfaceOperationTargetProvider,
  JsSurfaceSelectedMetadataSelection,
  JsSurfaceRuntimeHelperSelection,
  JsSurfaceSemanticExceptionSelection,
} from "./operation-types.js";
import {
  jsSurfaceTargetMemberIsCallable,
} from "./operation-types.js";

export function operationRowFromMetadataIndex(
  identity: JsSurfaceSourceIdentitySelector,
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly TargetMember[]>,
  evidence: Pick<JsSurfaceOperationRow, "capabilityId" | "requiredFacts"> = {},
): JsSurfaceOperationRow {
  return {
    identity,
    policyKind: "provider-member",
    targetProviders: [metadataIndexProvider(membersBySourceIdentity)],
    ...evidence,
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

export function selectedMetadataProvider(
  metadata: JsSurfaceSelectedMetadataSelection,
): JsSurfaceOperationTargetProvider {
  return {
    kind: "selected-metadata",
    metadata,
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
    case "selected-metadata":
      return targetMembersFromSelectedMetadata(provider.metadata, request);
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
    case "selected-metadata":
      return jsSurfaceSelectedTargetMembersForSelectedIdentity(request.selectedIdentity).some(jsSurfaceTargetMemberIsCallable);
    case "runtime-helper":
      return false;
    case "semantic-exception":
      return semanticExceptionHasCallableMember(provider.exception, request);
  }
}

function targetMembersFromSelectedMetadata(
  selection: JsSurfaceSelectedMetadataSelection,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (selection.kind) {
    case "closed-sequence": {
      const contextualElementType = sequenceElementTypeFromClosedFacts(request, selection);
      if (selection.requireResultElementType && contextualElementType === undefined) {
        return [];
      }
      return jsSurfaceSelectedTargetMembersForSelectedIdentity(request.selectedIdentity, {
        contextualDeclaringType: getSourceLibraryCallReceiverTargetTypes(request.request, request.context, request.host)[0],
        contextualElementType,
      });
    }
    case "closed-keyed-collection":
      return jsSurfaceSelectedTargetMembersForSelectedIdentity(request.selectedIdentity, {
        contextualDeclaringType: getSourceLibraryCallReceiverTargetTypes(request.request, request.context, request.host)[0],
        contextualResultType: selection.useResultCarrier
          ? getSourceLibraryCallResultTargetType(request.request, request.context, request.host)
          : undefined,
      });
  }
}

function targetMembersFromRuntimeHelperSelection(
  selection: JsSurfaceRuntimeHelperSelection,
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  switch (selection.kind) {
    case "record-dictionary":
      return getObjectRecordDictionaryCallMembers(selection.operation, request.request, request.context, request.host);
    case "record-dictionary-json-stringify":
      return getJsonRecordDictionaryStringifyCallMembers(request);
  }
}

function getJsonRecordDictionaryStringifyCallMembers(
  request: JsSurfaceCallTargetProviderRequest,
): readonly TargetMember[] {
  const dictionaryType = getSourceLibraryCallArgumentTargetTypes(request.request, request.context, request.host)
    .find((argumentType): argumentType is CsharpRecordDictionaryTargetTypeRef =>
      argumentType !== undefined && isStringKeyedRecordDictionaryTargetType(argumentType, request.host));
  return dictionaryType === undefined
    ? []
    : jsonRecordDictionaryStringifyTargetMembers(dictionaryType);
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
    case "boolean-call-construct":
      return booleanConstructorTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        isNewExpression(request.request.call, request.context) ? "new" : "call",
      );
    case "number-call-construct":
      return numberConstructorTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        isNewExpression(request.request.call, request.context) ? "new" : "call",
      );
    case "object-primitive-receiver-to-string":
      return getObjectPrimitiveReceiverCallMembers(request.request, request.context, request.host);
  }
}

function semanticExceptionHasCallableMember(
  selection: JsSurfaceSemanticExceptionSelection,
  request: JsSurfaceCallCallableProviderRequest,
): boolean {
  switch (selection.kind) {
    case "date-call-construct":
      return dateTargetMembersForSelectedIdentity(request.selectedIdentity, "call").some(jsSurfaceTargetMemberIsCallable);
    case "boolean-call-construct":
      return booleanConstructorTargetMembersForSelectedIdentity(request.selectedIdentity, "call").some(jsSurfaceTargetMemberIsCallable);
    case "number-call-construct":
      return numberConstructorTargetMembersForSelectedIdentity(request.selectedIdentity, "call").some(jsSurfaceTargetMemberIsCallable);
    case "object-primitive-receiver-to-string":
      return false;
  }
}

function sequenceElementTypeFromClosedFacts(
  providerRequest: JsSurfaceCallTargetProviderRequest,
  options: {
    readonly requireResultElementType: boolean;
  },
): TargetTypeRef | undefined {
  const { request, context, host } = providerRequest;
  const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
  if (options.requireResultElementType && resultElementType === undefined) {
    return undefined;
  }
  return resultElementType ?? arrayElementTypeFromClosedFacts(request, context, host);
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
