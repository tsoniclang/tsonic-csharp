import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../../target-types.js";
import {
  asNodeSubject,
} from "../../../../ast-utils.js";
import {
  booleanConstructorTargetMembersForSelectedIdentity,
} from "../../booleans.js";
import {
  numberConstructorTargetMembersForSelectedIdentity,
} from "../../numbers.js";
import {
  stringConstructorTargetMembersForSelectedIdentity,
} from "../../strings.js";
import {
  getCsharpArrayLikeElementType,
  getCsharpJsArrayCarrierElementType,
} from "../../arrays.js";
import {
  dateTargetMembersForSelectedIdentity,
} from "../../date/index.js";
import {
  collectionTargetTypeForSelectedIdentity,
} from "../../collections.js";
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
  getObjectRecordDictionaryAssignMembers,
  getObjectRecordDictionaryCallMembers,
  getObjectRecordDictionaryHasOwnMembers,
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
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly CsharpTargetMember[]>,
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
  membersBySourceIdentity: ReadonlyMap<SourceLibraryMemberKey, readonly CsharpTargetMember[]>,
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
): readonly CsharpTargetMember[] {
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
      return jsSurfaceSelectedTargetMembersForSelectedIdentity(request.selectedIdentity, {
        contextualDeclaringType: request.contextualDeclaringType,
        contextualResultType: request.contextualResultType,
      }).some(jsSurfaceTargetMemberIsCallable);
    case "runtime-helper":
      return false;
    case "semantic-exception":
      return semanticExceptionHasCallableMember(provider.exception, request);
  }
}

function targetMembersFromSelectedMetadata(
  selection: JsSurfaceSelectedMetadataSelection,
  request: JsSurfaceCallTargetProviderRequest,
): readonly CsharpTargetMember[] {
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
          ? getSourceLibraryCallResultTargetType(request.request, request.context, request.host) ??
            getExplicitCollectionConstructorResultType(request)
          : undefined,
      });
  }
}

function getExplicitCollectionConstructorResultType(
  request: JsSurfaceCallTargetProviderRequest,
): TargetTypeRef | undefined {
  const typeArguments = getExplicitCallTypeArguments(request);
  if (typeArguments.length === 0 || typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return collectionTargetTypeForSelectedIdentity(
    request.selectedIdentity,
    typeArguments as readonly TargetTypeRef[],
  );
}

function targetMembersFromRuntimeHelperSelection(
  selection: JsSurfaceRuntimeHelperSelection,
  request: JsSurfaceCallTargetProviderRequest,
): readonly CsharpTargetMember[] {
  switch (selection.kind) {
    case "record-dictionary":
      return getObjectRecordDictionaryCallMembers(selection.operation, request.request, request.context, request.host);
    case "record-dictionary-has-own":
      return getObjectRecordDictionaryHasOwnMembers(request.request, request.context, request.host);
    case "record-dictionary-assign":
      return getObjectRecordDictionaryAssignMembers(request.request, request.context, request.host);
    case "record-dictionary-json-stringify":
      return getJsonRecordDictionaryStringifyCallMembers(request);
  }
}

function getJsonRecordDictionaryStringifyCallMembers(
  request: JsSurfaceCallTargetProviderRequest,
): readonly CsharpTargetMember[] {
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
): readonly CsharpTargetMember[] {
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
    case "string-call-construct":
      return stringConstructorTargetMembersForSelectedIdentity(
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
    case "string-call-construct":
      return stringConstructorTargetMembersForSelectedIdentity(request.selectedIdentity, "call").some(jsSurfaceTargetMemberIsCallable);
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
  const explicitElementType = getExplicitCallTypeArguments(providerRequest)[0];
  if (options.requireResultElementType && resultElementType === undefined) {
    return explicitElementType;
  }
  return resultElementType ?? explicitElementType ?? arrayElementTypeFromClosedFacts(request, context, host);
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

function getExplicitCallTypeArguments(
  request: JsSurfaceCallTargetProviderRequest,
): readonly (TargetTypeRef | undefined)[] {
  const ast = request.context.compiler?.ast;
  if (ast === undefined || typeof ast.typeArguments !== "function") {
    return [];
  }
  const callNode = asNodeSubject(request.request.call);
  if (callNode === undefined) {
    return [];
  }
  return ast.typeArguments(callNode)
    .map((argument) => argument === undefined
      ? undefined
      : request.host.getTargetTypeRefForSubject(argument, request.context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: true,
        sourceFile: ast.getSourceFile(argument),
      })
    );
}
