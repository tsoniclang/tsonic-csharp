import {
  acceptObservation,
  deferObservation,
  rejectObservation,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  SelectedTargetSignatureFact,
  SourceSelectedMethodTypeArgument,
  SourceSelectedSignatureParameter,
  TargetCallArgumentConversionSlot,
  TargetBindingFact,
  TargetParameter,
  TargetSignatureSelection,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpProjectSourceFactKey,
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
  applyProviderVirtualExternAlias,
  findTargetBindingFromVirtualDeclaration,
  findTargetBinding,
  findTargetBindingFromResolvedTargetType,
} from "../provider-bindings.js";
import {
  instantiateSelectedTargetMember,
} from "../selected-target-member-instantiation.js";
import {
  targetMemberAsSourceSelectedSignature,
} from "../selected-target-source-signature.js";
import {
  csharpSourceOwnedTargetSignatureSelection,
  isCsharpSourceOwnedSelectedSignature,
} from "../source-owned-selected-signature.js";
import type {
  TargetMemberSelectionOptions,
} from "../target-member-arguments/index.js";
import {
  getTargetArgumentConversionSlots,
} from "../target-member-arguments/index.js";
import {
  findUnsupportedProviderTargetMember,
} from "../provider-unsupported-members.js";
import {
  targetMemberIsClosed,
  targetTypeRefIsClosed,
} from "../target-ref-utils.js";
import {
  csharpTargetMemberFact,
  getCsharpTypeofRuntimeKindForTargetType,
} from "../target-types.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "../target-types/runtime-carriers.js";
import {
  isVoidTargetType,
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
  checkedCallIsConstruction,
  getCsharpCheckedCallRequestContext,
} from "../checked-call-request-context.js";
import {
  asNodeSubject,
} from "../ast-utils.js";
import {
  csharpSourceProfileCallMember,
  getCsharpSourceProfileMemberIdentity,
} from "../source-profile-operations.js";

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
  let virtualDeclaration = getSelectedCallProviderVirtualDeclaration(request, context);
  const sourceMarkerCall = mapCsharpSourceMarkerCall(request, context, extensionId, virtualDeclaration, attributeFact);
  if (sourceMarkerCall !== undefined) {
    return sourceMarkerCall;
  }
  if (attributeFact !== undefined) {
    const attributeFactDiagnostic = validateCsharpAttributeMarkerFact(attributeFact, extensionId);
    if (attributeFactDiagnostic !== undefined) {
      return rejectObservation(attributeFactDiagnostic);
    }
    const member = erasedAttributeFactMember(attributeFact);
    const argumentConversions = getTargetArgumentConversionSlots(member.parameters, {
      argumentCount: request.arguments.length,
      sourceArgumentBindings: request.sourceArgumentBindings,
    });
    if (argumentConversions === undefined) {
      return rejectObservation(csharpProviderDiagnostic(
        extensionId,
        "CSHARP_ATTRIBUTE_MARKER_ARGUMENT_BINDINGS_NOT_PROVEN",
        9100187,
        "C# attribute marker erasure requires exact TSTS argument-slot evidence.",
        undefined,
        request.call,
      ));
    }
    return acceptObservation<CheckedCallMappingResult>({
      kind: "target",
      selectedSignature: { member },
      argumentConversions,
    }, [{ message: "C# attribute builder marker call was checked by finalized TSTS attribute facts and marked for fact-driven erasure." }]);
  }
  const existingSelectedSignature = context.facts.get(request.call, selectedTargetSignatureFactKey) ??
    context.factResolver.resolve(request.call, selectedTargetSignatureFactKey);
  if (existingSelectedSignature !== undefined) {
    const existingSignatureDiagnostic = getSelectedSignatureArgumentConversionDiagnostic(
      existingSelectedSignature,
      request.arguments.length,
      request.call,
      extensionId,
    );
    if (existingSignatureDiagnostic !== undefined) {
      return rejectObservation(existingSignatureDiagnostic);
    }
    if (isCsharpSourceOwnedSelectedSignature(existingSelectedSignature)) {
      recordSourceOwnedCallRuntimeCarrierIfResolved(request, context, host);
    }
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
        csharpTargetOperationFromMember(existingSelectedMember, {
          ...(existingSelectedSignature.targetTypeArguments === undefined ? {} : { typeArguments: existingSelectedSignature.targetTypeArguments }),
        }),
        [{ message: "C# target call operation reused from the existing finalized TSTS selected target signature for this checked call." }],
      );
    }
    return acceptObservation<CheckedCallMappingResult>({
      kind: "target",
      selectedSignature: targetSignatureSelectionFromFact(existingSelectedSignature),
      argumentConversions: existingSelectedSignature.argumentConversions,
    }, [{ message: "C# target call mapping reused the existing selected target signature for a repeated TSTS checker observation." }]);
  }
  const sourceProfileCall = acceptCsharpSourceProfileCall(request, context, extensionId);
  if (sourceProfileCall !== undefined) {
    return sourceProfileCall;
  }
  if (!checkedCallHasSelectedSourceEvidence(request)) {
    return rejectCheckedCallNotMapped(request, extensionId);
  }
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  virtualDeclaration ??= getSelectedCallProviderVirtualDeclaration(request, context, requestContext);
  const binding = findTargetBinding(context, [
    request.sourceSelectedDeclaration,
    request.sourceCallee.selectedDeclaration,
    request.sourceCallee.selectedSymbol,
    request.sourceCallee.declaration,
    request.sourceCallee.symbol,
    requestContext.calleeSelectedPropertySymbol,
    requestContext.calleeSelectedPropertyDeclaration,
    requestContext.calleeSymbol,
    request.callee,
    requestContext.calleeReceiverTypeSymbol,
    requestContext.calleeReceiverType,
  ]) ?? findTargetBindingFromVirtualDeclaration(
    virtualDeclaration,
    host.getCsharpTargetBindingByTargetId,
    host.getCsharpTargetBindingByMetadataName,
  ) ?? findTargetBindingFromResolvedTargetType(
    context,
    [requestContext.calleeReceiver, requestContext.calleeReceiverType],
    host.getTargetTypeRefForSubject,
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
    const sourceOwnedCall = acceptSourceOwnedCheckedCall(request, context, host);
    if (sourceOwnedCall !== undefined) {
      return sourceOwnedCall;
    }
    if (context.phase === "checking") {
      return deferObservation;
    }
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_CHECKED_CALL_TARGET_BINDING_NOT_PROVEN",
      9100185,
      "C# checked call has TSTS-selected source evidence, but no provider, source-profile, or project-source target call contract owns it.",
      [{
        message: "Selected checked call has no finalized C# target binding",
        details: {
          hasSourceSelectedSignature: request.sourceSelectedSignature !== undefined,
          hasSourceSelectedDeclaration: request.sourceSelectedDeclaration !== undefined,
          hasSourceSelectedCalleeSymbol: request.sourceCallee.selectedSymbol !== undefined,
          hasSourceSelectedCalleeDeclaration: request.sourceCallee.selectedDeclaration !== undefined,
          hasSourceCalleeSymbol: request.sourceCallee.symbol !== undefined,
          hasSourceCalleeDeclaration: request.sourceCallee.declaration !== undefined,
        },
      }],
      request.call,
    ));
  }
  const targetBinding = binding.target === csharpTargetId
    ? applyProviderVirtualExternAlias(host.getCsharpTargetBindingByTargetId(binding.id) ?? binding, virtualDeclaration) ?? binding
    : binding;
  if (request.sourceSelectedSignature !== undefined && getVirtualDeclarationSignatureId(virtualDeclaration) === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_SELECTED_PROVIDER_SIGNATURE_NOT_PROVEN",
      9100162,
      `C# provider resolved target binding '${targetBinding.id}', but TSTS did not prove the selected provider signature identity for checked call '${requestContext.calleePropertyName ?? "<anonymous>"}'.`,
      [{
        message: "Missing selected provider signature identity",
        details: {
          bindingId: targetBinding.id,
          selectedMemberId: virtualDeclaration?.memberId,
          selectedSignatureId: virtualDeclaration?.signatureId,
          sourceSelectedSignatureAvailable: true,
        },
      }],
    ));
  }
  const unsupportedSelectedMember = findUnsupportedProviderTargetMember(targetBinding, virtualDeclaration);
  if (getVirtualDeclarationSignatureId(virtualDeclaration) !== undefined && unsupportedSelectedMember !== undefined) {
    return rejectUnsupportedTargetMember(extensionId, targetBinding.id, unsupportedSelectedMember);
  }
  const methodTargetTypeArguments = getSelectedMethodTargetTypeArguments(request, context, host);
  const constructorDeclaringTargetType = checkedCallIsConstruction(request) && targetBinding.members?.some((candidate) => candidate.kind === "constructor") === true
    ? getConstructorDeclaringTargetType(targetBinding, request, context, host, methodTargetTypeArguments)
    : undefined;
  const receiverDeclaringTargetType = constructorDeclaringTargetType === undefined
    ? getReceiverDeclaringTargetType(request, context, host)
    : constructorDeclaringTargetType;
  const providerStaticContainerReceiver =
    isProviderStaticContainerReceiver(virtualDeclaration) &&
    selectedProviderDeclarationBelongsToTargetBinding(virtualDeclaration, targetBinding);
  const selectionOptions: TargetMemberSelectionOptions = {
    getBaseTargetTypeRef: host.getBaseTargetTypeRef,
    getAssignableTargetTypeRefs: host.getAssignableTargetTypeRefs,
    ...(providerStaticContainerReceiver ? { firstArgumentReceiver: false as const } : {}),
    ...(receiverDeclaringTargetType !== undefined ? { declaringTargetType: receiverDeclaringTargetType } : {}),
    ...(targetBinding.typeParameters !== undefined ? { declaringTypeParameters: targetBinding.typeParameters } : {}),
    ...(methodTargetTypeArguments !== undefined ? { methodTargetTypeArguments } : {}),
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
  const declaringTargetType = member.kind === "constructor"
    ? constructorDeclaringTargetType ?? member.declaringType
    : getReceiverDeclaringTargetType(request, context, host);
  if (member.kind === "constructor" && declaringTargetType === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_CONSTRUCTOR_RESULT_TYPE_NOT_PROVEN", 9100135, `C# provider selected constructor '${member.id}', but no provider target type fact proved the constructed target type.`));
  }
  const selectedMemberMethodTargetTypeArguments = (member.typeParameters?.length ?? 0) > 0
    ? methodTargetTypeArguments
    : undefined;
  const csharpMember = instantiateSelectedTargetMember({
    member,
    ...(selectedMemberMethodTargetTypeArguments !== undefined ? { targetTypeArguments: selectedMemberMethodTargetTypeArguments } : {}),
  }, host, { declaringTargetType });
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_RENDERABLE", 9100104, `C# provider selected '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  const sourceSelectedMember = targetMemberAsSourceSelectedSignature(csharpMember, {
    firstArgumentReceiver: csharpMember.receiverPassing === "first-argument" && !providerStaticContainerReceiver,
  });
  const argumentConversions = getTargetArgumentConversionSlots(sourceSelectedMember.parameters, {
    argumentCount: request.arguments.length,
    sourceArgumentBindings: request.sourceArgumentBindings,
  });
  if (argumentConversions === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_TARGET_ARGUMENT_CONVERSIONS_NOT_PROVEN",
      9100163,
      `C# provider selected target member '${csharpMember.id}', but argument conversion facts could not be closed for the checked call.`,
      [targetArgumentConversionMissEvidence(csharpMember.id, sourceSelectedMember, request.arguments.length, virtualDeclaration)],
    ));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(csharpMember, {
    ...(selectedMemberMethodTargetTypeArguments !== undefined ? { typeArguments: selectedMemberMethodTargetTypeArguments } : {}),
  }), [{ message: "C# target call operation finalized from checked TSTS selection and provider target identity." }]);
  return acceptObservation<CheckedCallMappingResult>({
    kind: "target",
    selectedSignature: {
      member: sourceSelectedMember,
      ...(selectedMemberMethodTargetTypeArguments !== undefined ? { targetTypeArguments: selectedMemberMethodTargetTypeArguments } : {}),
      ...(virtualDeclaration?.signatureId === undefined ? {} : { providerDeclaration: virtualDeclaration }),
    },
    argumentConversions,
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
}

function selectedProviderDeclarationBelongsToTargetBinding(
  declaration: ProviderVirtualDeclarationFact | undefined,
  targetBinding: TargetBindingFact,
): boolean {
  return declaration?.targetIdentity?.kind === "target-named" &&
    declaration.targetIdentity.id === targetBinding.id;
}

function acceptCsharpSourceProfileCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const selectedDeclaration = asNodeSubject(request.sourceSelectedDeclaration);
  const identity = getCsharpSourceProfileMemberIdentity(selectedDeclaration, context);
  const member = csharpSourceProfileCallMember(identity);
  if (member === undefined) {
    return undefined;
  }
  const argumentConversions = getTargetArgumentConversionSlots(member.parameters, {
    argumentCount: request.arguments.length,
    sourceArgumentBindings: request.sourceArgumentBindings,
  });
  if (argumentConversions === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_SOURCE_PROFILE_ARGUMENT_CONVERSIONS_NOT_PROVEN",
      9100163,
      `C# source profile selected member '${member.id}', but argument conversion facts could not be closed for the checked call.`,
      [{
        message: "Missing source-profile selected target argument conversions",
        details: {
          selectedMemberId: member.id,
          argumentCount: request.arguments.length,
          parameterCount: member.parameters.length,
        },
      }],
    ));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(member), [{
    message: "C# source-profile call operation recorded from TSTS-selected source declaration identity and C# source profile metadata.",
  }]);
  if (member.returnType !== undefined) {
    context.facts.set(request.call, runtimeCarrierFactKey, { carrier: member.returnType }, [{
      message: "C# source-profile call runtime carrier recorded from selected source-profile declaration metadata.",
    }]);
  }
  return acceptObservation<CheckedCallMappingResult>({
    kind: "target",
    selectedSignature: { member },
    argumentConversions,
  }, [{ message: "C# source-profile call selected from checked TSTS source declaration identity." }]);
}

function checkedCallHasSelectedSourceEvidence(request: CheckedCallMappingRequest): boolean {
  return request.sourceSelectedSignature !== undefined ||
    request.sourceSelectedDeclaration !== undefined ||
    request.sourceCallee.selectedSymbol !== undefined ||
    request.sourceCallee.selectedDeclaration !== undefined ||
    request.sourceCallee.symbol !== undefined ||
    request.sourceCallee.declaration !== undefined;
}

function rejectCheckedCallNotMapped(
  request: CheckedCallMappingRequest,
  extensionId: string,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(
    extensionId,
    "CSHARP_CHECKED_CALL_NOT_MAPPED",
    9100164,
    "C# checked call must be selected by TSTS/provider facts before emission.",
    [{
      message: "Missing TSTS-selected call/member evidence",
      details: {
        hasSourceSelectedSignature: request.sourceSelectedSignature !== undefined,
        hasSourceSelectedDeclaration: request.sourceSelectedDeclaration !== undefined,
        hasSourceSelectedCalleeSymbol: request.sourceCallee.selectedSymbol !== undefined,
        hasSourceSelectedCalleeDeclaration: request.sourceCallee.selectedDeclaration !== undefined,
        hasSourceCalleeSymbol: request.sourceCallee.symbol !== undefined,
        hasSourceCalleeDeclaration: request.sourceCallee.declaration !== undefined,
      },
    }],
    request.call,
  ));
}

function getSelectedSignatureArgumentConversionDiagnostic(
  selectedSignature: SelectedTargetSignatureFact,
  argumentCount: number,
  call: CheckedCallMappingRequest["call"],
  extensionId: string,
): ReturnType<typeof csharpProviderDiagnostic> | undefined {
  if (isCsharpSourceOwnedSelectedSignature(selectedSignature)) {
    return undefined;
  }
  const expectedConversions = getTargetArgumentConversionSlots(
    csharpTargetMemberFact(selectedSignature.member)?.parameters ?? [],
    {
      argumentCount,
      sourceArgumentBindings: selectedSignature.sourceArgumentBindings,
    },
  );
  if (expectedConversions === undefined) {
    return {
      ...csharpProviderDiagnostic(
        extensionId,
        "CSHARP_TARGET_ARGUMENT_CONVERSIONS_NOT_PROVEN",
        9100163,
        `C# provider selected target member '${selectedSignature.member.id}', but finalized selected-signature argument conversion facts were missing for the checked call.`,
        [{
          message: "Missing selected target argument conversions",
          details: {
            selectedMemberId: selectedSignature.member.id,
            argumentCount,
            parameterCount: selectedSignature.member.parameters.length,
          },
        }],
      ),
      nodeOrSpan: call,
    };
  }
  if (!targetArgumentConversionsEqual(expectedConversions, selectedSignature.argumentConversions)) {
    return {
      ...csharpProviderDiagnostic(
        extensionId,
        "CSHARP_TARGET_ARGUMENT_CONVERSIONS_MISMATCH",
        9100164,
        `C# provider selected target member '${selectedSignature.member.id}', but finalized selected-signature argument conversion facts do not match the selected parameter facts.`,
        [{
          message: "Mismatched selected target argument conversions",
          details: {
            selectedMemberId: selectedSignature.member.id,
            expectedConversions,
            actualConversions: selectedSignature.argumentConversions,
          },
        }],
      ),
      nodeOrSpan: call,
    };
  }
  return undefined;
}

function targetArgumentConversionsEqual(
  expected: readonly TargetCallArgumentConversionSlot[],
  actual: readonly TargetCallArgumentConversionSlot[],
): boolean {
  return expected.length === actual.length &&
    expected.every((expectedConversion, index) => {
      const actualConversion = actual[index];
      return actualConversion !== undefined &&
        expectedConversion.sourceArgumentIndex === actualConversion.sourceArgumentIndex &&
        expectedConversion.sourceForm === actualConversion.sourceForm &&
        expectedConversion.spreadElementIndex === actualConversion.spreadElementIndex &&
        expectedConversion.targetParameterIndex === actualConversion.targetParameterIndex &&
        expectedConversion.targetForm === actualConversion.targetForm;
    });
}

function targetSignatureSelectionFromFact(
  fact: SelectedTargetSignatureFact,
): TargetSignatureSelection {
  return {
    member: fact.member,
    ...(fact.targetTypeArguments === undefined ? {} : { targetTypeArguments: fact.targetTypeArguments }),
    ...(fact.providerDeclaration === undefined ? {} : { providerDeclaration: fact.providerDeclaration }),
  };
}

function targetArgumentConversionMissEvidence(
  selectedTargetMemberId: string,
  sourceSelectedMember: SelectedTargetSignatureFact["member"],
  argumentCount: number,
  virtualDeclaration: ProviderVirtualDeclarationFact | undefined,
) {
  return {
    message: "C# provider selected target binding and member identity, but could not derive selected-signature argument conversions from target parameter facts.",
    details: {
      selectedTargetMemberId,
      selectedSourceMemberId: sourceSelectedMember.id,
      argumentCount,
      parameterCount: sourceSelectedMember.parameters.length,
      selectedMemberId: virtualDeclaration?.memberId,
      selectedSignatureId: virtualDeclaration?.signatureId,
    },
  };
}

function getReceiverDeclaringTargetType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  return host.getTargetTypeRefForSubject(requestContext.calleeReceiver, context) ??
    host.getTargetTypeRefForSubject(requestContext.calleeReceiverType, context);
}

function acceptSourceOwnedCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const declaration = getSourceOwnedCallDeclaration(request, context);
  if (declaration === undefined) {
    return undefined;
  }
  if (request.sourceSelectedSignatureKind !== "resolved") {
    return rejectOrDeferSourceOwnedCall(context, csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_SOURCE_CALL_SIGNATURE_NOT_RESOLVED",
      9100186,
      "C# source-owned call mapping requires a resolved TSTS-selected source signature.",
      [{
        message: "Selected source call signature is not a resolved checked signature.",
        details: {
          sourceSelectedSignatureKind: request.sourceSelectedSignatureKind,
          hasSourceSelectedSignature: request.sourceSelectedSignature !== undefined,
          hasSourceSelectedSignatureParameters: request.sourceSelectedSignatureParameters !== undefined,
        },
      }],
      request.call,
    ));
  }
  const targetTypeArguments = getSelectedMethodTargetTypeArguments(request, context, host);
  if (
    request.sourceSelectedMethodTypeArguments !== undefined &&
    request.sourceSelectedMethodTypeArguments.length > 0 &&
    targetTypeArguments === undefined
  ) {
    return rejectOrDeferSourceOwnedCall(context, csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_SOURCE_METHOD_TYPE_ARGUMENT_NOT_PROVEN",
      9100182,
      "C# source-owned generic call requires every TSTS-selected source method type argument to map to a finalized target type fact.",
      [{
        message: "Selected source method type arguments could not be closed as target facts.",
        details: {
          typeParameters: request.sourceSelectedMethodTypeArguments.map((argument) => argument.typeParameterName),
        },
      }],
      request.call,
    ));
  }
  const returnType = getSourceOwnedCallReturnType(request, context, host);
  if (returnType === undefined) {
    return rejectOrDeferSourceOwnedCall(context, csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_SOURCE_CALL_RESULT_FACT_NOT_PROVEN",
      9100188,
      "C# source-owned call requires its exact TSTS-selected source result to map to a finalized target type fact.",
      undefined,
      request.call,
    ));
  }
  const parameters = getSourceOwnedCallParameters(request, context, host);
  if (parameters === undefined) {
    return rejectOrDeferSourceOwnedCall(context, csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_SOURCE_CALL_PARAMETER_FACT_NOT_PROVEN",
      9100183,
      "C# source-owned call requires finalized parameter target facts for the exact TSTS-selected source declaration.",
      [{ message: "Selected source call parameter target facts are incomplete." }],
      request.call,
    ));
  }
  recordSourceOwnedCallRuntimeCarrier(request.call, returnType, context);
  const selectedSignature = csharpSourceOwnedTargetSignatureSelection({
    parameters,
    returnType,
    ...(targetTypeArguments === undefined ? {} : { targetTypeArguments }),
  });
  const argumentConversions = getTargetArgumentConversionSlots(
    csharpTargetMemberFact(selectedSignature.member)?.parameters ?? [],
    {
      argumentCount: request.arguments.length,
      sourceArgumentBindings: request.sourceArgumentBindings,
    },
  );
  if (argumentConversions === undefined) {
    return rejectOrDeferSourceOwnedCall(context, csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_SOURCE_CALL_ARGUMENT_CONVERSIONS_NOT_PROVEN",
      9100184,
      "C# source-owned call requires exact TSTS source argument bindings for every selected target parameter slot.",
      undefined,
      request.call,
    ));
  }
  return acceptObservation<CheckedCallMappingResult>({
    kind: "target",
    selectedSignature,
    argumentConversions,
  }, [{ message: "C# target observed a TSTS-selected project source call; backend emission remains source-owned and target facts are not inferred from source spelling." }]);
}

function getSourceOwnedCallParameters(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): readonly TargetParameter[] | undefined {
  const parameters = request.sourceSelectedSignatureParameters;
  if (parameters === undefined) {
    return undefined;
  }
  const mapped: TargetParameter[] = [];
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter === undefined || parameter.parameterIndex !== index) {
      return undefined;
    }
    const targetType = getSelectedSourceParameterTargetType(parameter, context, host);
    if (targetType === undefined) {
      return undefined;
    }
    mapped.push({
      name: parameter.parameterName.length === 0 ? `arg${index}` : parameter.parameterName,
      type: targetType,
      passingMode: "by-value",
      ...(parameter.acceptsOmission ? { optional: true } : {}),
      ...(parameter.rest ? { paramsArray: true } : {}),
    });
  }
  return mapped;
}

function getSelectedSourceParameterTargetType(
  parameter: SourceSelectedSignatureParameter,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return host.getTargetTypeRefForSubject(parameter.authoredTypeNode, context) ??
    host.getTargetTypeRefForSubject(parameter.selectedType, context);
}

function rejectOrDeferSourceOwnedCall(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  diagnostic: ReturnType<typeof csharpProviderDiagnostic>,
): ExtensionObservation<CheckedCallMappingResult> {
  return context.phase === "checking"
    ? deferObservation
    : rejectObservation(diagnostic);
}

function recordSourceOwnedCallRuntimeCarrierIfResolved(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): void {
  recordSourceOwnedCallRuntimeCarrier(
    request.call,
    getSourceOwnedCallReturnType(request, context, host),
    context,
  );
}

function recordSourceOwnedCallRuntimeCarrier(
  call: ExtensionFactSubject,
  returnType: TargetTypeRef | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): void {
  if (
    returnType === undefined ||
    returnType.kind === "array" ||
    !targetTypeRefIsClosed(returnType) ||
    isVoidTargetType(returnType) ||
    context.facts.get(call, runtimeCarrierFactKey) !== undefined ||
    context.factResolver.resolve(call, runtimeCarrierFactKey) !== undefined
  ) {
    return;
  }
  context.facts.set(call, runtimeCarrierFactKey, { carrier: returnType }, [{
    message: "C# source-owned call runtime carrier recorded from TSTS-selected project source declaration return facts.",
  }]);
}

function getSourceOwnedCallReturnType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  const authoredResultType = host.getTargetTypeRefForSubject(request.sourceResult.authoredTypeNode, context);
  if (isFinalizedSourceOwnedReturnCarrier(authoredResultType)) {
    return authoredResultType;
  }
  const finalizedReturnCarrier = getRuntimeCarrierForSubject(request.sourceResult.type, context);
  if (isFinalizedSourceOwnedReturnCarrier(finalizedReturnCarrier)) {
    return finalizedReturnCarrier;
  }
  const directReturnType = host.getTargetTypeRefForSubject(request.sourceResult.type, context);
  if (isFinalizedSourceOwnedReturnCarrier(directReturnType)) {
    return directReturnType;
  }
  return undefined;
}

function getSelectedMethodTargetTypeArguments(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): readonly TargetTypeRef[] | undefined {
  const sourceSelectedArguments = request.sourceSelectedMethodTypeArguments;
  if (sourceSelectedArguments === undefined || sourceSelectedArguments.length === 0) {
    return undefined;
  }
  const targetTypeArguments = sourceSelectedArguments.map((argument) =>
    getSelectedSourceTypeArgumentTargetRef(argument, context, host)
  );
  if (targetTypeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return targetTypeArguments as readonly TargetTypeRef[];
}

function getSelectedSourceTypeArgumentTargetRef(
  argument: SourceSelectedMethodTypeArgument,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return host.getTargetTypeRefForSubject(argument.explicitTypeNode, context) ??
    host.getTargetTypeRefForSubject(argument.selectedType, context);
}

function getRuntimeCarrierForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  return context.facts.get(subject, runtimeCarrierFactKey)?.carrier ??
    context.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier;
}

function isFinalizedSourceOwnedReturnCarrier(
  carrier: TargetTypeRef | undefined,
): carrier is TargetTypeRef {
  if (carrier === undefined) {
    return false;
  }
  if (isCsharpAnyRuntimeCarrier(carrier)) {
    return false;
  }
  return targetTypeRefIsClosed(carrier);
}

function getSourceOwnedCallDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionFactSubject | undefined {
  for (const declaration of [
    request.sourceSelectedDeclaration,
    request.sourceCallee.selectedDeclaration,
  ]) {
    if (
      declaration !== undefined &&
      (context.facts.get(declaration, csharpProjectSourceFactKey) !== undefined ||
        context.factResolver.resolve(declaration, csharpProjectSourceFactKey) !== undefined)
    ) {
      return declaration;
    }
  }
  return undefined;
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
    host.getTargetTypeRefForSubject(requestContext.calleeReceiver, context) ??
      host.getTargetTypeRefForSubject(requestContext.calleeReceiverType, context),
  );
  if (receiverType?.kind === "array" || (receiverType?.kind === "target-named" && receiverType.id === dotnetNativeArrayTypeId)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_PROPERTY_NOT_SUPPORTED", 9100136, `C# native array source contract has no target-backed property '${sourceName}'.`));
  }
  if (getCsharpTypeofRuntimeKindForTargetType(receiverType) === "string") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_PROPERTY_ACCESS_NOT_MAPPED", 9100144, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`));
  }
  return undefined;
}
