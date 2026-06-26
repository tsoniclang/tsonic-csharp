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
  csharpTargetArrayCreationOperation,
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
} from "../operations.js";
import {
  dotnetNativeArrayTypeId,
  isDotnetNativeArrayCreateMemberId,
} from "../../../providers/dotnet/native-array.js";
import {
  findTargetBinding,
} from "../provider-bindings.js";
import {
  instantiateSelectedTargetMember,
} from "../selected-target-member-instantiation.js";
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
  getNativeArrayCreateElementType,
  mapDotnetNativeArrayCreateCall,
} from "./native-array-create.js";

export function mapCsharpCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedCallMappingResult> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const attributeFact = getCheckedAttributeBuilderFact(request, context);
  const virtualDeclaration = getSelectedCallProviderVirtualDeclaration(request, context);
  const sourceMarkerCall = mapCsharpSourceMarkerCall(request, context, extensionId, virtualDeclaration, attributeFact);
  if (sourceMarkerCall !== undefined) {
    return sourceMarkerCall;
  }
  if (attributeFact !== undefined) {
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedAttributeFactMember(attributeFact) },
    }, [{ message: "C# attribute builder marker call was checked by finalized TSTS attribute facts and marked for fact-driven erasure." }]);
  }
  const existingSelectedSignature = context.facts.get(request.call, selectedTargetSignatureFactKey);
  if (existingSelectedSignature !== undefined) {
    if (
      context.facts.get(request.call, csharpTargetOperationFactKey) === undefined &&
      targetMemberIsClosed(existingSelectedSignature.member)
    ) {
      recordCsharpTargetOperation(
        context,
        request.call,
        csharpTargetOperationFromMember(existingSelectedSignature.member),
        [{ message: "C# target call operation reused from the existing finalized TSTS selected target signature for this checked call." }],
      );
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: existingSelectedSignature,
    }, [{ message: "C# target call mapping reused the existing selected target signature for a repeated TSTS checker observation." }]);
  }
  const binding = findTargetBinding(context, [
    request.sourceSelectedDeclaration,
    request.sourceSelectedContainerSymbol,
    request.sourceSelectedDeclarationContainer,
    request.calleeAliasedSymbol,
    request.calleeResolvedSymbol,
    request.calleeSymbol,
    request.callee,
    request.calleeReceiverTypeSymbol,
    request.calleeReceiverType,
    request.calleeReceiverAliasedSymbol,
    request.calleeReceiverResolvedSymbol,
    request.calleeReceiverSymbol,
  ]);
  const nativeArrayCreate = mapDotnetNativeArrayCreateCall(request, context, extensionId, host, virtualDeclaration);
  if (nativeArrayCreate !== undefined) {
    return nativeArrayCreate;
  }
  if (binding === undefined) {
    const unsupportedNativeReceiverCall = rejectUnsupportedNativeReceiverCall(request, context, extensionId, host);
    if (unsupportedNativeReceiverCall !== undefined) {
      return unsupportedNativeReceiverCall;
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
  const constructorDeclaringTargetType = request.calleePropertyName === undefined && targetBinding.members?.some((candidate) => candidate.kind === "constructor") === true
    ? getConstructorDeclaringTargetType(targetBinding, request, context, host)
    : undefined;
  const receiverDeclaringTargetType = constructorDeclaringTargetType === undefined
    ? host.getTargetTypeRefForSubject(request.calleeReceiverType, context) ??
      host.getTargetTypeRefForSubject(request.calleeReceiver, context)
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
      `C# provider could not map checked call '${request.calleePropertyName ?? "<anonymous>"}' on target '${targetBinding.id}'.`,
      targetMemberMissEvidence(targetBinding, virtualDeclaration, request, selectionOptions),
    ));
  }
  if (member.kind !== "method" && member.kind !== "constructor") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_CALLABLE", 9100101, `C# provider mapped checked call '${request.calleePropertyName ?? "<anonymous>"}' to non-callable target member '${member.id}'.`));
  }
  if (member.static === true && request.calleeReceiver !== undefined && !providerStaticContainerReceiver && member.receiverPassing !== "first-argument") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_EXTENSION_RECEIVER_NOT_PROVEN", 9100115, `C# provider selected static target member '${member.id}' for receiver call '${request.calleePropertyName ?? "<anonymous>"}', but target metadata did not prove first-argument receiver passing.`));
  }
  const declaringTargetType = member.kind === "constructor" ? constructorDeclaringTargetType ?? member.declaringType : host.getTargetTypeRefForSubject(request.calleeReceiverType, context) ??
    host.getTargetTypeRefForSubject(request.calleeReceiver, context) ??
    host.getTargetTypeRefForSubject(request.call, context);
  if (member.kind === "constructor" && declaringTargetType === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_CONSTRUCTOR_RESULT_TYPE_NOT_PROVEN", 9100135, `C# provider selected constructor '${member.id}', but no provider target type fact proved the constructed target type.`));
  }
  const nativeArrayElementType = isDotnetNativeArrayCreateMemberId(member.id)
    ? getNativeArrayCreateElementType(request, context, host)
    : undefined;
  if (isDotnetNativeArrayCreateMemberId(member.id) && nativeArrayElementType === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_CREATE_ELEMENT_TYPE_NOT_PROVEN", 9100134, "C# native array creation requires an explicit or contextual TSTS-proven element target type."));
  }
  const selectedSignature = nativeArrayElementType === undefined
    ? { member }
    : { member, targetTypeArguments: [nativeArrayElementType] };
  const csharpMember = instantiateSelectedTargetMember(selectedSignature, host, { declaringTargetType });
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_RENDERABLE", 9100104, `C# provider selected '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  if (nativeArrayElementType !== undefined) {
    recordCsharpTargetOperation(context, request.call, csharpTargetArrayCreationOperation(csharpMember.id, nativeArrayElementType, csharpMember), [{ message: "C# native array creation operation finalized from checked TSTS provider declaration and explicit target array facts." }]);
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: csharpMember, targetTypeArguments: [nativeArrayElementType] },
    }, [{ message: "C# native array creation selected from checked TSTS provider declaration." }]);
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target call operation finalized from checked TSTS selection and provider target identity." }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: csharpMember },
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
}

function rejectUnsupportedNativeReceiverCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const sourceName = request.calleePropertyName;
  if (sourceName === undefined) {
    return undefined;
  }
  const receiverType = unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.calleeReceiverType, context) ??
      host.getTargetTypeRefForSubject(request.calleeReceiver, context),
  );
  if (receiverType?.kind === "array" || (receiverType?.kind === "target-named" && receiverType.id === dotnetNativeArrayTypeId)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_PROPERTY_NOT_SUPPORTED", 9100136, `C# native array source contract has no target-backed property '${sourceName}'.`));
  }
  if (getCsharpTypeofRuntimeKindForTargetType(receiverType) === "string") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_PROPERTY_ACCESS_NOT_MAPPED", 9100144, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`));
  }
  return undefined;
}
