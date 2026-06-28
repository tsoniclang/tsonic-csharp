import {
  acceptObservation,
  deferObservation,
  rejectObservation,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../../csharp-facts.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  csharpTargetId,
} from "../identity.js";
import {
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
} from "../operations.js";
import {
  dotnetNativeArrayTypeId,
  isDotnetNativeArrayCreateMemberId,
} from "../../../providers/dotnet/native-array.js";
import {
  findTargetBindingFromVirtualDeclaration,
  findTargetBinding,
} from "../provider-bindings.js";
import {
  instantiateSelectedTargetMember,
} from "../selected-target-member-instantiation.js";
import {
  targetMemberAsSourceSelectedSignature,
} from "../selected-target-source-signature.js";
import {
  csharpSourceOwnedSelectedSignatureFact,
} from "../source-owned-selected-signature.js";
import type {
  TargetMemberSelectionOptions,
} from "../target-member-arguments/index.js";
import {
  findUnsupportedProviderTargetMember,
} from "../provider-unsupported-members.js";
import {
  targetMemberIsClosed,
} from "../target-ref-utils.js";
import {
  csharpTargetMemberFact,
  getCsharpTypeofRuntimeKindForTargetType,
} from "../target-types.js";
import {
  unwrapNullableTargetType,
} from "../target-rules.js";
import {
  erasedAttributeFactMember,
  getCheckedAttributeBuilderFact,
} from "../erased-source-markers.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  mapCsharpSourceMarkerCall,
  validateCsharpAttributeMarkerFact,
} from "./source-marker-calls.js";
import {
  getSelectedCallProviderVirtualDeclaration,
} from "./virtual-declarations.js";
import {
  findCsharpTargetMemberForCall,
  getConstructorDeclaringTargetType,
  getVirtualDeclarationSignatureId,
  isProviderStaticContainerReceiver,
  rejectUnsupportedTargetMember,
  targetMemberMissEvidence,
} from "./target-call-selection.js";
import {
  mapDotnetNativeArrayCreateCall,
} from "./native-array-create.js";
import {
  getCsharpCheckedCallRequestContext,
} from "../checked-call-request-context.js";
import {
  asNodeSubject,
  isDeclarationOrVirtualSourceFile,
} from "../ast-utils.js";

export function mapCsharpCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedCallMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const attributeFact = getCheckedAttributeBuilderFact(request, context);
  const virtualDeclaration = getSelectedCallProviderVirtualDeclaration(request, context);
  const sourceMarkerCall = mapCsharpSourceMarkerCall(request, context, extensionId, virtualDeclaration, attributeFact);
  if (sourceMarkerCall !== undefined) {
    return sourceMarkerCall;
  }
  if (attributeFact !== undefined) {
    const attributeFactDiagnostic = validateCsharpAttributeMarkerFact(attributeFact, extensionId);
    if (attributeFactDiagnostic !== undefined) {
      return rejectObservation(attributeFactDiagnostic);
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedAttributeFactMember(attributeFact) },
    }, [{ message: "C# attribute builder marker call was checked by finalized TSTS attribute facts and marked for fact-driven erasure." }]);
  }
  const existingSelectedSignature = context.facts.get(request.call, selectedTargetSignatureFactKey);
  if (existingSelectedSignature !== undefined) {
    const existingSelectedMember = csharpTargetMemberFact(existingSelectedSignature.member);
    if (
      existingSelectedMember !== undefined &&
      context.facts.get(request.call, csharpTargetOperationFactKey) === undefined &&
      targetMemberIsClosed(existingSelectedMember) &&
      existingSelectedMember.receiverPassing !== "first-argument"
    ) {
      recordCsharpTargetOperation(
        context,
        request.call,
        csharpTargetOperationFromMember(existingSelectedMember),
        [{ message: "C# target call operation reused from the existing finalized TSTS selected target signature for this checked call." }],
      );
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: existingSelectedSignature,
    }, [{ message: "C# target call mapping reused the existing selected target signature for a repeated TSTS checker observation." }]);
  }
  const binding = findTargetBinding(context, [
    request.sourceSelectedDeclaration,
    requestContext.sourceSelectedContainerSymbol,
    requestContext.sourceSelectedDeclarationContainer,
    requestContext.calleeAliasedSymbol,
    requestContext.calleeResolvedSymbol,
    requestContext.calleeSymbol,
    request.sourceCalleeSymbol,
    request.callee,
    requestContext.calleeReceiverTypeSymbol,
    requestContext.calleeReceiverType,
    requestContext.calleeReceiverAliasedSymbol,
    requestContext.calleeReceiverResolvedSymbol,
    requestContext.calleeReceiverSymbol,
  ]) ?? findTargetBindingFromVirtualDeclaration(
    virtualDeclaration,
    host.getCsharpTargetBindingByTargetId,
    host.getCsharpTargetBindingByMetadataName,
  );
  const nativeArrayCreate = mapDotnetNativeArrayCreateCall(request, context, extensionId, host, virtualDeclaration);
  if (nativeArrayCreate !== undefined) {
    return nativeArrayCreate;
  }
  if (binding === undefined) {
    const unsupportedNativeReceiverCall = rejectUnsupportedNativeReceiverCall(request, context, extensionId, host);
    if (unsupportedNativeReceiverCall !== undefined) {
      return unsupportedNativeReceiverCall;
    }
    const unsupportedExternalCall = rejectUnmappedExternalCall(request, context, extensionId);
    if (unsupportedExternalCall !== undefined) {
      return unsupportedExternalCall;
    }
    const sourceOwnedCall = acceptSourceOwnedCheckedCall(request, context, host);
    if (sourceOwnedCall !== undefined) {
      return sourceOwnedCall;
    }
    return deferObservation;
  }
  const targetBinding = binding.target === csharpTargetId
    ? host.getCsharpTargetBindingByTargetId(binding.id) ?? binding
    : binding;
  const unsupportedSelectedMember = findUnsupportedProviderTargetMember(targetBinding, virtualDeclaration);
  if (getVirtualDeclarationSignatureId(virtualDeclaration) !== undefined && unsupportedSelectedMember !== undefined) {
    return rejectUnsupportedTargetMember(extensionId, targetBinding.id, unsupportedSelectedMember);
  }
  const constructorDeclaringTargetType = requestContext.calleePropertyName === undefined && targetBinding.members?.some((candidate) => candidate.kind === "constructor") === true
    ? getConstructorDeclaringTargetType(targetBinding, request, context, host)
    : undefined;
  const receiverDeclaringTargetType = constructorDeclaringTargetType === undefined
    ? host.getTargetTypeRefForSubject(requestContext.calleeReceiverType, context) ??
      host.getTargetTypeRefForSubject(requestContext.calleeReceiver, context)
    : constructorDeclaringTargetType;
  const providerStaticContainerReceiver = isProviderStaticContainerReceiver(request, context, targetBinding);
  const selectionOptions: TargetMemberSelectionOptions = {
    getBaseTargetTypeRef: host.getBaseTargetTypeRef,
    ...(providerStaticContainerReceiver ? { firstArgumentReceiver: false as const } : {}),
    ...(receiverDeclaringTargetType !== undefined ? { declaringTargetType: receiverDeclaringTargetType } : {}),
    ...(targetBinding.typeParameters !== undefined ? { declaringTypeParameters: targetBinding.typeParameters } : {}),
  };
  const member = findCsharpTargetMemberForCall(
    targetBinding,
    virtualDeclaration,
    request,
    context,
    host,
    selectionOptions,
  );
  if (member === undefined) {
    const unsupportedMember = unsupportedSelectedMember;
    if (unsupportedMember !== undefined) {
      return rejectUnsupportedTargetMember(extensionId, targetBinding.id, unsupportedMember);
    }
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_TARGET_MEMBER_NOT_FOUND",
      9100100,
      `C# provider could not map checked call '${requestContext.calleePropertyName ?? "<anonymous>"}' on target '${targetBinding.id}'.`,
      targetMemberMissEvidence(targetBinding, virtualDeclaration, request, context, selectionOptions),
    ));
  }
  if (member.kind !== "method" && member.kind !== "constructor") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_CALLABLE", 9100101, `C# provider mapped checked call '${requestContext.calleePropertyName ?? "<anonymous>"}' to non-callable target member '${member.id}'.`));
  }
  if (member.static === true && requestContext.calleeReceiver !== undefined && !providerStaticContainerReceiver && member.receiverPassing !== "first-argument") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_EXTENSION_RECEIVER_NOT_PROVEN", 9100115, `C# provider selected static target member '${member.id}' for receiver call '${requestContext.calleePropertyName ?? "<anonymous>"}', but target metadata did not prove first-argument receiver passing.`));
  }
  if (isDotnetNativeArrayCreateMemberId(member.id)) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_NATIVE_ARRAY_CREATE_SELECTED_DECLARATION_NOT_PROVEN",
      9100155,
      "C# native array creation requires the exact selected provider declaration to be mapped by the native array creation path before generic call mapping.",
    ));
  }
  const declaringTargetType = member.kind === "constructor" ? constructorDeclaringTargetType ?? member.declaringType : host.getTargetTypeRefForSubject(requestContext.calleeReceiverType, context) ??
    host.getTargetTypeRefForSubject(requestContext.calleeReceiver, context) ??
    host.getTargetTypeRefForSubject(request.call, context);
  if (member.kind === "constructor" && declaringTargetType === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_CONSTRUCTOR_RESULT_TYPE_NOT_PROVEN", 9100135, `C# provider selected constructor '${member.id}', but no provider target type fact proved the constructed target type.`));
  }
  const csharpMember = instantiateSelectedTargetMember({ member }, host, { declaringTargetType });
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_RENDERABLE", 9100104, `C# provider selected '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target call operation finalized from checked TSTS selection and provider target identity." }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: targetMemberAsSourceSelectedSignature(csharpMember) },
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
}

function acceptSourceOwnedCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const compiler = context.compiler;
  const declaration = asNodeSubject(request.sourceSelectedDeclaration);
  if (compiler === undefined || declaration === undefined) {
    return undefined;
  }
  const declarationSourceFile = compiler.ast.getSourceFile(declaration);
  if (declarationSourceFile === undefined || isDeclarationOrVirtualSourceFile(declarationSourceFile, compiler.ast)) {
    return undefined;
  }
  const returnType = host.getTargetTypeRefForSubject(request.call, context);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: csharpSourceOwnedSelectedSignatureFact({
      ...(request.sourceSelectedSignature === undefined ? {} : { sourceSignature: request.sourceSelectedSignature }),
      sourceDeclaration: declaration,
      ...(returnType === undefined ? {} : { returnType }),
    }),
  }, [{ message: "C# target observed a TSTS-selected project source call; backend emission remains source-owned and target facts are not inferred from source spelling." }]);
}

function rejectUnmappedExternalCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const compiler = context.compiler;
  const declaration = asNodeSubject(request.sourceSelectedDeclaration);
  if (compiler === undefined || declaration === undefined) {
    return undefined;
  }
  const declarationSourceFile = compiler.ast.getSourceFile(declaration);
  if (declarationSourceFile?.IsDeclarationFile !== true) {
    return undefined;
  }
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  return rejectObservation(csharpProviderDiagnostic(
    extensionId,
    "CSHARP_EXTERNAL_CALL_NOT_MAPPED",
    9100161,
    `C# target requires selected target facts for external TypeScript declaration call '${requestContext.calleePropertyName ?? "<anonymous>"}'.`,
    [
      {
        message: "Missing selected target mapping",
        details: {
          sourceDeclarationFile: compiler.ast.getFileName(declarationSourceFile),
          calleePropertyName: requestContext.calleePropertyName,
        },
      },
    ],
  ));
}

function rejectUnsupportedNativeReceiverCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const sourceName = requestContext.calleePropertyName;
  if (sourceName === undefined) {
    return undefined;
  }
  const receiverType = unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(requestContext.calleeReceiverType, context) ??
      host.getTargetTypeRefForSubject(requestContext.calleeReceiver, context),
  );
  if (receiverType?.kind === "array" || (receiverType?.kind === "target-named" && receiverType.id === dotnetNativeArrayTypeId)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_PROPERTY_NOT_SUPPORTED", 9100136, `C# native array source contract has no target-backed property '${sourceName}'.`));
  }
  if (getCsharpTypeofRuntimeKindForTargetType(receiverType) === "string") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_PROPERTY_ACCESS_NOT_MAPPED", 9100144, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`));
  }
  return undefined;
}
