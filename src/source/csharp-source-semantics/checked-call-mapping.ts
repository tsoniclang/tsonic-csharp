import {
  acceptObservation,
  argumentPassingFactKey,
  defaultValueFactKey,
  deferObservation,
  flowStateFactKey,
  providerVirtualDeclarationFactKey,
  rejectObservation,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  ArgumentPassingFact,
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionEvidence,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  FlowStateFact,
  ProviderVirtualDeclarationFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  unsupportedCsharpSourceFlowMarkerDiagnostic,
} from "./source-flow-diagnostics.js";
import {
  csharpTargetId,
} from "./identity.js";
import {
  csharpTargetArrayCreationOperation,
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
} from "./operations.js";
import {
  asNodeSubject,
} from "./ast-utils.js";
import {
  dotnetNativeArrayTypeId,
  isDotnetNativeArrayCreateMemberId,
} from "../../providers/dotnet/native-array.js";
import {
  findTargetBinding,
} from "./provider-bindings.js";
import {
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";
import {
  findTargetMemberForCall,
  selectTargetMember,
} from "./target-member-selection.js";
import type {
  TargetMemberSelectionOptions,
} from "./target-member-arguments/index.js";
import {
  findUnsupportedProviderTargetMember,
  unsupportedProviderTargetMemberEvidence,
} from "./provider-unsupported-members.js";
import {
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import {
  targetMemberIsClosed,
} from "./target-ref-utils.js";
import {
  getCsharpTypeofRuntimeKindForTargetType,
} from "./target-types.js";
import {
  unwrapNullableTargetType,
} from "./target-rules.js";
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

function rejectUnsupportedTargetMember(
  extensionId: string,
  targetBindingId: string,
  unsupportedMember: NonNullable<ReturnType<typeof findUnsupportedProviderTargetMember>>,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(
    extensionId,
    "CSHARP_TARGET_MEMBER_UNSUPPORTED",
    9100130,
    `C# provider selected unsupported target ${unsupportedMember.memberKind} '${unsupportedMember.targetName}' on target '${targetBindingId}'. ${unsupportedMember.reason}`,
    unsupportedProviderTargetMemberEvidence(targetBindingId, unsupportedMember),
  ));
}

function mapCsharpSourceMarkerCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
  virtualDeclaration: ProviderVirtualDeclarationFact | undefined,
  attributeFact: ReturnType<typeof getCheckedAttributeBuilderFact>,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
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
    if ((fieldFact as { readonly type?: unknown }).type === undefined) {
      return rejectObservation(csharpProviderDiagnostic(
        extensionId,
        "CSHARP_FIELD_MARKER_TYPE_NOT_PROVEN",
        9100152,
        "C# field marker call requires finalized TSTS field type evidence before erasure.",
        sourceMarkerFactEvidence("field", "field.type", fieldFact),
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
    const missingFactDiagnostic = missingRequiredSourceMarkerFactDiagnostic(
      request,
      context,
      virtualDeclaration,
      extensionId,
      attributeFact !== undefined,
    );
    if (missingFactDiagnostic !== undefined) {
      return rejectObservation(missingFactDiagnostic);
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member },
    }, [{ message: "C# source-semantics marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  return undefined;
}

function getVirtualDeclarationSignatureId(declaration: ProviderVirtualDeclarationFact | undefined): string | undefined {
  return declaration === undefined ? undefined : declaration.signatureId;
}

function findCsharpTargetMemberForCall(
  binding: NonNullable<ReturnType<typeof findTargetBinding>>,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
  options: TargetMemberSelectionOptions,
): TargetMember | undefined {
  const selectedMember = findTargetMemberForCall(
    binding,
    declaration,
    request,
    context,
    host.getTargetTypeRefForSubject,
    options,
  );
  if (selectedMember !== undefined) {
    return selectedMember;
  }
  const constructorMember = findConstructorTargetMemberForProviderType(
    binding,
    declaration,
    request,
    context,
    host,
    options,
  );
  if (constructorMember !== undefined) {
    return constructorMember;
  }
  return undefined;
}

function findConstructorTargetMemberForProviderType(
  binding: NonNullable<ReturnType<typeof findTargetBinding>>,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
  options: TargetMemberSelectionOptions,
): TargetMember | undefined {
  if (declaration?.memberId !== undefined || declaration?.signatureId !== undefined || request.calleePropertyName !== undefined) {
    return undefined;
  }
  return selectTargetMember(
    (binding.members ?? []).filter((candidate) => candidate.kind === "constructor"),
    {
      arguments: request.arguments,
      receiver: request.calleeReceiver,
    },
    context,
    host.getTargetTypeRefForSubject,
    options,
  );
}

function targetMemberMissEvidence(
  binding: NonNullable<ReturnType<typeof findTargetBinding>>,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
  options: TargetMemberSelectionOptions,
): readonly ExtensionEvidence[] {
  return [
    {
      message: "C# provider target binding was resolved, but no target member matched the checked TSTS call observation.",
      details: {
        bindingId: binding.id,
        calleePropertyName: request.calleePropertyName,
        argumentCount: request.arguments.length,
        hasReceiver: request.calleeReceiver !== undefined,
        selectedMemberId: declaration?.memberId,
        selectedSignatureId: declaration?.signatureId,
        selectedExportName: declaration?.exportName,
        selectedMemberName: declaration?.memberName,
        selectedTargetIdentity: declaration?.targetIdentity,
        declaringTargetType: options.declaringTargetType,
        firstArgumentReceiver: options.firstArgumentReceiver === false ? false : options.firstArgumentReceiver !== undefined,
        candidateMemberIds: (binding.members ?? []).map((candidate) => candidate.id),
      },
    },
  ];
}

function missingRequiredSourceMarkerFactDiagnostic(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  declaration: ProviderVirtualDeclarationFact,
  extensionId: string,
  hasAttributeFact: boolean,
): ReturnType<typeof csharpProviderDiagnostic> | undefined {
  switch (declaration.exportName) {
    case "out":
    case "ref":
    case "inref":
      return validateArgumentPassingMarkerFact(request, context, declaration.exportName, extensionId);
    case "borrow":
    case "borrowMut":
    case "move":
      {
        const flowState = getFinalizedFlowStateFact(request, context);
        return flowState === undefined
          ? missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_FLOW_MARKER_FACT_NOT_PROVEN", declaration.exportName, "source-flow")
          : unsupportedCsharpSourceFlowMarkerDiagnostic(extensionId, flowState);
      }
    case "attribute":
      return !hasAttributeFact
        ? missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_ATTRIBUTE_MARKER_FACT_NOT_PROVEN", declaration.exportName, "attribute")
        : undefined;
    case "defaultof":
      {
        const defaultValue = getFinalizedDefaultValueFact(request, context);
        if (defaultValue === undefined) {
          return missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_DEFAULT_MARKER_FACT_NOT_PROVEN", declaration.exportName, "default-value");
        }
        return (defaultValue as { readonly type?: unknown }).type === undefined
          ? csharpProviderDiagnostic(
              extensionId,
              "CSHARP_DEFAULT_MARKER_TYPE_NOT_PROVEN",
              9100153,
              "C# defaultof marker call requires finalized TSTS default-value type evidence before erasure.",
              sourceMarkerFactEvidence("defaultof", "defaultValue.type", defaultValue),
            )
          : undefined;
      }
    default:
      return undefined;
  }
}

function validateArgumentPassingMarkerFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  markerName: "out" | "ref" | "inref",
  extensionId: string,
): ReturnType<typeof csharpProviderDiagnostic> | undefined {
  const passing = getFinalizedArgumentPassingFact(request, context);
  if (passing === undefined) {
    return missingSourceMarkerFactDiagnostic(extensionId, "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN", markerName, "argument-passing");
  }
  const expectedMode = expectedArgumentPassingMode(markerName);
  if (passing.mode !== expectedMode) {
    return csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ARGUMENT_MARKER_MODE_NOT_PROVEN",
      9100150,
      `C# source marker '${markerName}' requires finalized TSTS argument-passing mode '${expectedMode}', but received '${String(passing.mode)}'.`,
      sourceMarkerFactEvidence(markerName, "argumentPassing.mode", passing),
    );
  }
  if (passing.targetExpression === undefined) {
    return csharpProviderDiagnostic(
      extensionId,
      "CSHARP_ARGUMENT_MARKER_STORAGE_NOT_PROVEN",
      9100151,
      `C# source marker '${markerName}' requires finalized TSTS storage target evidence before it can be erased.`,
      sourceMarkerFactEvidence(markerName, "argumentPassing.targetExpression", passing),
    );
  }
  return undefined;
}

function expectedArgumentPassingMode(markerName: "out" | "ref" | "inref"): ArgumentPassingFact["mode"] {
  switch (markerName) {
    case "out":
      return "byref-writeonly-must-init";
    case "ref":
      return "byref-readwrite";
    case "inref":
      return "byref-readonly";
  }
}

function getFinalizedArgumentPassingFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ArgumentPassingFact | undefined {
  return context.factResolver.resolve(request.call, argumentPassingFactKey) ??
    context.facts.get(request.call, argumentPassingFactKey);
}

function getFinalizedFlowStateFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): FlowStateFact | undefined {
  return context.factResolver.resolve(request.call, flowStateFactKey) ??
    context.facts.get(request.call, flowStateFactKey);
}

function getFinalizedDefaultValueFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): { readonly type?: unknown } | undefined {
  return context.factResolver.resolve(request.call, defaultValueFactKey) ??
    context.facts.get(request.call, defaultValueFactKey);
}

function sourceMarkerFactEvidence(
  markerName: string,
  requiredField: string,
  fact: unknown,
): readonly ExtensionEvidence[] {
  return [{
    message: "C# source marker fact validation failed closed.",
    details: {
      markerName,
      requiredField,
      fact,
    },
  }];
}

function missingSourceMarkerFactDiagnostic(
  extensionId: string,
  code: string,
  markerName: string,
  factName: string,
): ReturnType<typeof csharpProviderDiagnostic> {
  return csharpProviderDiagnostic(
    extensionId,
    code,
    9100149,
    `C# source marker '${markerName}' requires a finalized TSTS ${factName} fact before the marker call can be erased.`,
  );
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

function mapDotnetNativeArrayCreateCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  extensionId: string,
  host: CsharpOperationsProviderHost,
  virtualDeclaration: ProviderVirtualDeclarationFact | undefined,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const selectedMemberId = virtualDeclaration?.signatureId ?? virtualDeclaration?.memberId;
  if (selectedMemberId === undefined || !isDotnetNativeArrayCreateMemberId(selectedMemberId)) {
    return undefined;
  }
  const targetBinding = host.getCsharpTargetBindingByTargetId(dotnetNativeArrayTypeId);
  if (targetBinding === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_CREATE_TARGET_FACT_NOT_PROVEN", 9100135, "C# native array creation requires finalized provider target binding facts for the explicit .NET Array source contract."));
  }
  const member = targetBinding.members?.find((candidate) => isDotnetNativeArrayCreateMemberId(candidate.id));
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_NATIVE_ARRAY_CREATE_MEMBER_FACT_NOT_PROVEN",
      9100154,
      "C# native array creation requires a provider-owned target member fact for the explicit .NET Array.create source contract.",
      [{
        message: "C# native array create member metadata was missing from the selected provider target binding.",
        details: {
          bindingId: targetBinding.id,
          selectedMemberId,
          candidateMemberIds: targetBinding.members?.map((candidate) => candidate.id) ?? [],
        },
      }],
    ));
  }
  const nativeArrayElementType = getNativeArrayCreateElementType(request, context, host);
  if (nativeArrayElementType === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_CREATE_ELEMENT_TYPE_NOT_PROVEN", 9100134, "C# native array creation requires an explicit or contextual TSTS-proven element target type."));
  }
  const csharpMember = instantiateSelectedTargetMember(
    { member, targetTypeArguments: [nativeArrayElementType] },
    host,
    {},
  );
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_RENDERABLE", 9100104, `C# provider selected '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetArrayCreationOperation(csharpMember.id, nativeArrayElementType, csharpMember), [{ message: "C# native array creation operation finalized from checked TSTS provider declaration and explicit target array facts." }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: csharpMember, targetTypeArguments: [nativeArrayElementType] },
  }, [{ message: "C# native array creation selected from checked TSTS provider declaration." }]);
}

function getSelectedCallProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ProviderVirtualDeclarationFact | undefined {
  return getProviderVirtualDeclaration(context, [
    request.sourceSelectedSignature,
    request.sourceSelectedDeclaration,
    request.calleeSymbol,
    request.calleeResolvedSymbol,
    request.calleeAliasedSymbol,
  ]) ?? getCalleePropertyProviderVirtualDeclaration(request, context);
}

function getCalleePropertyProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ProviderVirtualDeclarationFact | undefined {
  const compiler = context.compiler;
  const callee = asNodeSubject(request.callee);
  if (compiler === undefined || callee === undefined || !compiler.ast.is.IsPropertyAccessExpression(callee)) {
    return undefined;
  }
  const propertyName = compiler.ast.name(callee);
  if (propertyName === undefined) {
    return undefined;
  }
  return getProviderVirtualDeclaration(context, [callee, propertyName]);
}

function getProviderVirtualDeclaration(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): ProviderVirtualDeclarationFact | undefined {
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const declaration = context.factResolver.resolve(subject, providerVirtualDeclarationFactKey);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
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

function getNativeArrayCreateElementType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  const ast = context.compiler?.ast;
  const callNode = asNodeSubject(request.call);
  if (ast !== undefined && callNode !== undefined) {
    const explicitTypeArguments = ast.typeArguments(callNode)
      .map((argument) => host.getTargetTypeRefForSubject(argument, context));
    if (explicitTypeArguments.length === 1 && explicitTypeArguments[0] !== undefined) {
      return explicitTypeArguments[0];
    }
  }
  const contextualReturnType = host.getTargetTypeRefForSubject(request.sourceReturnType, context);
  return contextualReturnType?.kind === "array" ? contextualReturnType.element : undefined;
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
  ]);
  return receiverBinding?.target === targetBinding.target && receiverBinding.id === targetBinding.id;
}
