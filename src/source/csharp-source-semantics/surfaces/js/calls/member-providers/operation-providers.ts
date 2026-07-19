import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../../target-types.js";
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
  deferredJsonObjectShapeStringifyTargetMembers,
  jsonObjectShapeStringifyTargetMembers,
  jsonRecordDictionaryStringifyTargetMembers,
} from "../../json.js";
import {
  jsonSerializableObjectShapeForSubject,
} from "../../json-shape-serialization.js";
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
  getSourceLibraryCallReceiverClosedTargetTypes,
  getSourceLibraryCallReceiverElementType,
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
import {
  promiseAllTargetMembers,
  promiseConstructorTargetMembers,
} from "../../promises.js";
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
import {
  getApplicableSourceCallEvidence,
} from "../../../../selected-source-evidence.js";

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
  return withSelectedSourceIdentity(targetMembersFromOperationTargetProviderCore(provider, request), request.selectedIdentity.key);
}

function targetMembersFromOperationTargetProviderCore(
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

function withSelectedSourceIdentity(
  members: readonly CsharpTargetMember[],
  sourceIdentityKey: SourceLibraryMemberKey,
): readonly CsharpTargetMember[] {
  return members.map((member) => ({
    ...member,
    sourceIdentityKeys: [...new Set([...(member.sourceIdentityKeys ?? []), sourceIdentityKey])],
  }));
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
        contextualDeclaringType: getSourceLibraryCallReceiverClosedTargetTypes(request.request, request.context)[0],
        contextualElementType,
      });
    }
    case "closed-keyed-collection":
      return jsSurfaceSelectedTargetMembersForSelectedIdentity(request.selectedIdentity, {
        contextualDeclaringType: getSourceLibraryCallReceiverClosedTargetTypes(request.request, request.context)[0],
        contextualResultType: selection.useResultCarrier
          ? getExplicitCollectionConstructorResultType(request) ??
            getSourceLibraryCallResultTargetType(request.request, request.context, request.host)
          : undefined,
      });
  }
}

function getExplicitCollectionConstructorResultType(
  request: JsSurfaceCallTargetProviderRequest,
): TargetTypeRef | undefined {
  const typeArguments = getExplicitCallTypeArguments(request);
  if (typeArguments.length > 0 && !typeArguments.some((argument) => argument === undefined)) {
    return collectionTargetTypeForSelectedIdentity(
      request.selectedIdentity,
      typeArguments as readonly TargetTypeRef[],
    );
  }
  return getSourceLibraryCallResultTargetType(request.request, request.context, request.host);
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
    case "object-shape-json-stringify":
      return getJsonObjectShapeStringifyCallMembers(request);
    case "promise-constructor":
      return promiseConstructorTargetMembers(request.request, request.context, request.host);
    case "promise-all":
      return promiseAllTargetMembers(request.request, request.context, request.host);
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

function getJsonObjectShapeStringifyCallMembers(
  request: JsSurfaceCallTargetProviderRequest,
): readonly CsharpTargetMember[] {
  const argument = request.request.arguments[0];
  const argumentType = getSourceLibraryCallArgumentTargetTypes(request.request, request.context, request.host)[0];
  const objectShape = jsonSerializableObjectShapeForSubject(argument, argumentType, request.context, request.host);
  if (objectShape !== undefined) {
    return jsonObjectShapeStringifyTargetMembers(objectShape.targetType);
  }
  if (argumentType === undefined) {
    return deferredJsonObjectShapeStringifyTargetMembers();
  }
  return argumentType?.kind === "target-named" && argumentTypeMayAcquireObjectShape(argumentType, request)
    ? jsonObjectShapeStringifyTargetMembers(argumentType)
    : [];
}

function argumentTypeMayAcquireObjectShape(
  argumentType: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  request: JsSurfaceCallTargetProviderRequest,
): boolean {
  return !request.host.isCsharpStringType(argumentType) &&
    argumentType.id !== "Tsonic.CSharp.Js.JSObject" &&
    argumentType.id !== "Tsonic.CSharp.Js.TsValue" &&
    argumentType.id !== "Tsonic.CSharp.Js.JSArray`1" &&
    !isStringKeyedRecordDictionaryTargetType(argumentType, request.host);
}

function targetMembersFromSemanticException(
  selection: JsSurfaceSemanticExceptionSelection,
  request: JsSurfaceCallTargetProviderRequest,
): readonly CsharpTargetMember[] {
  switch (selection.kind) {
    case "date-call-construct":
      return dateTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        isNewExpression(request.request) ? "new" : "call",
      );
    case "boolean-call-construct":
      return booleanConstructorTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        isNewExpression(request.request) ? "new" : "call",
      );
    case "number-call-construct":
      return numberConstructorTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        isNewExpression(request.request) ? "new" : "call",
      );
    case "string-call-construct":
      return stringConstructorTargetMembersForSelectedIdentity(
        request.selectedIdentity,
        isNewExpression(request.request) ? "new" : "call",
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
    readonly requireClosedInputElementType?: boolean;
  },
): TargetTypeRef | undefined {
  const { request, context, host } = providerRequest;
  const explicitElementType = getExplicitCallTypeArguments(providerRequest)[0];
  const closedInputElementType = arrayElementTypeFromClosedInputFacts(request, context, host);
  const resultElementType = getCsharpJsArrayCarrierElementType(getSourceLibraryCallResultTargetType(request, context, host));
  if (options.requireClosedInputElementType === true && explicitElementType === undefined && closedInputElementType === undefined) {
    return undefined;
  }
  if (options.requireResultElementType && resultElementType === undefined) {
    return explicitElementType ?? closedInputElementType;
  }
  return explicitElementType ?? closedInputElementType ?? resultElementType;
}

function arrayElementTypeFromClosedInputFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return getSourceLibraryCallReceiverElementType(request, context, host) ??
    request.arguments.map((argument) => {
      const nested = getClosedNestedCallArgumentTargetType(argument, context);
      if (nested !== undefined) {
        return nested;
      }
      return getSourceLibraryCallArgumentTargetType(argument, request, context, host);
    }).map(getCsharpArrayLikeElementType).find((element) => element !== undefined);
}

function getSourceLibraryCallArgumentTargetType(
  argument: CheckedCallMappingRequest["arguments"][number],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const index = request.arguments.indexOf(argument);
  return index < 0
    ? undefined
    : getSourceLibraryCallArgumentTargetTypes(request, context, host)[index];
}

function getClosedNestedCallArgumentTargetType(
  argument: CheckedCallMappingRequest["arguments"][number],
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetTypeRef | undefined {
  return context.facts.get(argument, selectedTargetSignatureFactKey)?.member.returnType ??
    context.facts.get(argument, runtimeCarrierFactKey)?.carrier ??
    context.factResolver.resolve(argument, selectedTargetSignatureFactKey)?.member.returnType ??
    context.factResolver.resolve(argument, runtimeCarrierFactKey)?.carrier;
}

function getExplicitCallTypeArguments(
  request: JsSurfaceCallTargetProviderRequest,
): readonly (TargetTypeRef | undefined)[] {
  const sourceSelection = getApplicableSourceCallEvidence(request.request);
  if (sourceSelection === undefined || sourceSelection.methodTypeArguments.some((argument) => argument.explicitTypeNode === undefined)) {
    return [];
  }
  return sourceSelection.methodTypeArguments.map((argument) =>
    request.host.getTargetTypeRefForSubject(argument.explicitTypeNode, request.context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: false,
    })
  );
}
