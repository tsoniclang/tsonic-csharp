import {
  acceptObservation,
  deferObservation,
  providerVirtualDeclarationFactKey,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
} from "./operations.js";
import {
  asNodeSubject,
} from "./ast-utils.js";
import {
  findTargetBinding,
  resolveTargetBindingForReference,
} from "./provider-bindings.js";
import {
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";
import {
  findTargetMemberForCall,
} from "./target-member-selection.js";
import {
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import {
  targetMemberIsClosed,
} from "./target-ref-utils.js";
import {
  erasedAttributeFactMember,
  erasedFieldFactMember,
  erasedSourceSemanticsMember,
  getCheckedAttributeBuilderFact,
  getCheckedFieldFact,
  isErasedFieldSourceSemanticsCall,
  isErasedSourceSemanticsCall,
} from "./erased-source-markers.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";

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
  if (isErasedFieldSourceSemanticsCall(virtualDeclaration)) {
    const fieldFact = getCheckedFieldFact(request, context);
    if (fieldFact === undefined) {
      return rejectObservation(csharpProviderDiagnostic(
        extensionId,
        "CSHARP_FIELD_MARKER_FACT_NOT_PROVEN",
        9100112,
        "C# field marker call requires a finalized TSTS FieldFact with field type evidence before erasure.",
      ));
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedFieldFactMember(fieldFact) },
    }, [{ message: "C# field marker call was checked by finalized TSTS field facts and marked for fact-driven erasure." }]);
  }
  if (isErasedSourceSemanticsCall(virtualDeclaration)) {
    const member = erasedSourceSemanticsMember(virtualDeclaration) ??
      (attributeFact === undefined ? undefined : erasedAttributeFactMember(attributeFact));
    if (member === undefined) {
      return rejectObservation(csharpProviderDiagnostic(
        extensionId,
        "CSHARP_ERASED_SOURCE_MARKER_IDENTITY_NOT_PROVEN",
        9100111,
        "C# source-semantics marker call was checked by TSTS, but no provider virtual member or signature identity proves the erased marker selection.",
      ));
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member },
    }, [{ message: "C# source-semantics marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  if (attributeFact !== undefined) {
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedAttributeFactMember(attributeFact) },
    }, [{ message: "C# attribute builder marker call was checked by finalized TSTS attribute facts and marked for fact-driven erasure." }]);
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
  ]) ?? resolveTargetBindingForReference(request.callee, context);
  if (binding === undefined) {
    return deferObservation;
  }
  const targetBinding = binding.target === csharpTargetId
    ? host.getCsharpTargetBindingByTargetId(binding.id) ?? binding
    : binding;
  const constructorDeclaringTargetType = request.calleePropertyName === undefined && targetBinding.members?.some((candidate) => candidate.kind === "constructor") === true
    ? getConstructorDeclaringTargetType(targetBinding, request, context, host)
    : undefined;
  const receiverDeclaringTargetType = constructorDeclaringTargetType === undefined
    ? host.getTargetTypeRefForSubject(request.calleeReceiverType, context) ??
      host.getTargetTypeRefForSubject(request.calleeReceiver, context)
    : constructorDeclaringTargetType;
  const providerStaticContainerReceiver = isProviderStaticContainerReceiver(request, context, targetBinding);
  const member = findTargetMemberForCall(
    targetBinding,
    virtualDeclaration,
    request,
    context,
    host.getTargetTypeRefForSubject,
    {
      getBaseTargetTypeRef: host.getBaseTargetTypeRef,
      ...(providerStaticContainerReceiver ? { firstArgumentReceiver: false as const } : {}),
      ...(receiverDeclaringTargetType !== undefined ? { declaringTargetType: receiverDeclaringTargetType } : {}),
      ...(targetBinding.typeParameters !== undefined ? { declaringTypeParameters: targetBinding.typeParameters } : {}),
    },
  );
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_FOUND", 9100100, `C# provider could not map checked call '${request.calleePropertyName ?? "<anonymous>"}' on target '${targetBinding.id}'.`));
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
  const csharpMember = instantiateSelectedTargetMember({ member }, host, { declaringTargetType });
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_RENDERABLE", 9100104, `C# provider selected '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target call operation finalized from checked TSTS selection and provider target identity." }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: csharpMember },
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
}

function getSelectedCallProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ProviderVirtualDeclarationFact | undefined {
  return context.facts.get(request.sourceSelectedSignature, providerVirtualDeclarationFactKey) ??
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
}

function getConstructorDeclaringTargetType(
  binding: NonNullable<ReturnType<typeof findTargetBinding>>,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  const callNode = asNodeSubject(request.call);
  const ast = context.compiler?.ast;
  if (callNode === undefined || ast === undefined) {
    return undefined;
  }
  const targetTypeArguments = ast.typeArguments(callNode)
    .map((argument) => host.getTargetTypeRefForSubject(argument, context));
  if (targetTypeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const declaringTargetType = getCsharpTargetTypeFromBinding(binding, targetTypeArguments as NonNullable<typeof targetTypeArguments[number]>[], host);
  if (declaringTargetType === undefined) {
    return undefined;
  }
  return declaringTargetType;
}

function isProviderStaticContainerReceiver(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  targetBinding: NonNullable<ReturnType<typeof findTargetBinding>>,
): boolean {
  const receiverBinding = findTargetBinding(context, [
    request.calleeReceiver,
    request.calleeReceiverAliasedSymbol,
    request.calleeReceiverResolvedSymbol,
    request.calleeReceiverSymbol,
  ]) ?? resolveTargetBindingForReference(request.calleeReceiver, context);
  return receiverBinding?.target === targetBinding.target && receiverBinding.id === targetBinding.id;
}
