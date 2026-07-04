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
  Node,
  ProviderVirtualDeclarationFact,
  SelectedTargetSignatureFact,
  Signature,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
  csharpSourceReturnCarrierFactKey,
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
  findTargetBindingFromResolvedTargetType,
} from "../provider-bindings.js";
import {
  instantiateSelectedTargetMember,
} from "../selected-target-member-instantiation.js";
import {
  targetMemberAsSourceSelectedSignature,
} from "../selected-target-source-signature.js";
import {
  csharpSourceOwnedSelectedSignatureFact,
  isCsharpSourceOwnedSelectedSignature,
} from "../source-owned-selected-signature.js";
import type {
  TargetMemberSelectionOptions,
} from "../target-member-arguments/index.js";
import {
  getTargetArgumentConversionTypes,
} from "../target-member-arguments/index.js";
import {
  substituteTargetTypeRef,
} from "../target-member-arguments/type-substitution.js";
import {
  findUnsupportedProviderTargetMember,
} from "../provider-unsupported-members.js";
import {
  targetMemberIsClosed,
  targetTypeRefContainsSourcePrimitive,
  targetTypeRefEquals,
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
  getCsharpCheckedCallRequestContext,
} from "../checked-call-request-context.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeNameText,
} from "../ast-utils.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";
import {
  isAmbientOrExternalDeclaration,
} from "../source-declaration-utils.js";
import {
  sourceDeclarationTargetType,
} from "../source-declaration-facts/target-type.js";
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
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const attributeFact = getCheckedAttributeBuilderFact(request, context);
  const virtualDeclaration = getSelectedCallProviderVirtualDeclaration(request, context, requestContext);
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
        csharpTargetOperationFromMember(existingSelectedMember),
        [{ message: "C# target call operation reused from the existing finalized TSTS selected target signature for this checked call." }],
      );
    }
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: existingSelectedSignature,
    }, [{ message: "C# target call mapping reused the existing selected target signature for a repeated TSTS checker observation." }]);
  }
  const sourceProfileCall = acceptCsharpSourceProfileCall(request, context, host);
  if (sourceProfileCall !== undefined) {
    return sourceProfileCall;
  }
  const binding = findTargetBinding(context, [
    request.sourceSelectedDeclaration,
    requestContext.calleeSelectedPropertySymbol,
    requestContext.calleeSelectedPropertyContainerSymbol,
    requestContext.calleeSelectedPropertyDeclarationContainer,
    requestContext.calleeSelectedPropertyDeclaration,
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
  const constructorDeclaringTargetType = requestContext.calleePropertyName === undefined && targetBinding.members?.some((candidate) => candidate.kind === "constructor") === true
    ? getConstructorDeclaringTargetType(targetBinding, request, context, host)
    : undefined;
  const receiverDeclaringTargetType = constructorDeclaringTargetType === undefined
    ? getReceiverDeclaringTargetType(request, context, host)
    : constructorDeclaringTargetType;
  const providerStaticContainerReceiver = isProviderStaticContainerReceiver(request, context, targetBinding);
  const methodTargetTypeArguments = getExplicitCallMethodTargetTypeArguments(request.call, context, host);
  const selectionOptions: TargetMemberSelectionOptions = {
    getBaseTargetTypeRef: host.getBaseTargetTypeRef,
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
  const csharpMember = instantiateSelectedTargetMember({
    member,
    ...(methodTargetTypeArguments !== undefined ? { targetTypeArguments: methodTargetTypeArguments } : {}),
  }, host, { declaringTargetType });
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_RENDERABLE", 9100104, `C# provider selected '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  const sourceSelectedMember = targetMemberAsSourceSelectedSignature(csharpMember, {
    firstArgumentReceiver: csharpMember.receiverPassing === "first-argument" && !providerStaticContainerReceiver,
  });
  const argumentConversions = getTargetArgumentConversionTypes(sourceSelectedMember.parameters, request.arguments.length);
  if (argumentConversions === undefined) {
    return rejectObservation(csharpProviderDiagnostic(
      extensionId,
      "CSHARP_TARGET_ARGUMENT_CONVERSIONS_NOT_PROVEN",
      9100163,
      `C# provider selected target member '${csharpMember.id}', but argument conversion facts could not be closed for the checked call.`,
      [targetArgumentConversionMissEvidence(csharpMember.id, sourceSelectedMember, request.arguments.length, virtualDeclaration)],
    ));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target call operation finalized from checked TSTS selection and provider target identity." }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: {
      member: sourceSelectedMember,
      argumentConversions,
      ...(methodTargetTypeArguments !== undefined ? { targetTypeArguments: methodTargetTypeArguments } : {}),
      ...(virtualDeclaration?.signatureId === undefined ? {} : { providerDeclaration: virtualDeclaration }),
    },
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
}

function acceptCsharpSourceProfileCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  _host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const signatureDeclaration = getSignatureDeclaration(request.sourceSelectedSignature, context);
  const selectedDeclaration = asNodeSubject(request.sourceSelectedDeclaration) ?? signatureDeclaration;
  const identity = getCsharpSourceProfileMemberIdentity(selectedDeclaration, context);
  const member = csharpSourceProfileCallMember(identity);
  if (member === undefined) {
    return undefined;
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
    selectedSignature: { member },
  }, [{ message: "C# source-profile call selected from checked TSTS source declaration identity." }]);
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
  const expectedConversions = getTargetArgumentConversionTypes(
    csharpTargetMemberFact(selectedSignature.member)?.parameters ?? [],
    argumentCount,
  );
  if (expectedConversions === undefined || selectedSignature.argumentConversions === undefined) {
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
  expected: NonNullable<SelectedTargetSignatureFact["argumentConversions"]>,
  actual: NonNullable<SelectedTargetSignatureFact["argumentConversions"]>,
): boolean {
  return expected.length === actual.length &&
    expected.every((expectedConversion, index) => {
      const actualConversion = actual[index];
      return actualConversion !== undefined && targetTypeRefEquals(expectedConversion, actualConversion);
    });
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
  const declaration = getSourceOwnedCallDeclaration(request, context, host);
  if (declaration === undefined) {
    return undefined;
  }
  const returnType = getSourceOwnedCallReturnType(request, context, host);
  recordSourceOwnedCallRuntimeCarrier(request.call, returnType, context);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: csharpSourceOwnedSelectedSignatureFact({
      sourceDeclaration: declaration,
    }),
  }, [{ message: "C# target observed a TSTS-selected project source call; backend emission remains source-owned and target facts are not inferred from source spelling." }]);
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
  const signatureDeclaration = getSignatureDeclaration(request.sourceSelectedSignature, context);
  const uniqueCalleeDeclaration = getUniqueCalleeDeclaration(request, context);
  const selectedDeclaration = asNodeSubject(request.sourceSelectedDeclaration) ?? signatureDeclaration ?? uniqueCalleeDeclaration;
  const constructedType = getSourceOwnedConstructionReturnType(request.call, selectedDeclaration, context, host);
  if (constructedType !== undefined) {
    return constructedType;
  }
  const annotatedReturnType = getSourceOwnedCallableReturnTypeNode(selectedDeclaration, context);
  const annotatedReturnTargetType = getSourceOwnedCallableReturnTargetType(annotatedReturnType, context, host);
  const substitutedAnnotatedReturnTargetType = substituteSourceOwnedCallableTypeParameters(
    annotatedReturnTargetType,
    request,
    selectedDeclaration,
    context,
    host,
  );
  if (isFinalizedSourceOwnedReturnCarrier(substitutedAnnotatedReturnTargetType, annotatedReturnType, context)) {
    return substitutedAnnotatedReturnTargetType;
  }
  const selectedDeclarationReturnCarrier = getSourceReturnCarrierForSubjects([
    selectedDeclaration,
    signatureDeclaration,
    uniqueCalleeDeclaration,
    request.sourceCalleeSymbol,
  ], context);
  if (isFinalizedSourceOwnedReturnCarrier(selectedDeclarationReturnCarrier)) {
    return selectedDeclarationReturnCarrier;
  }
  const finalizedReturnCarrier = getRuntimeCarrierForSubject(request.sourceReturnType, context);
  if (isFinalizedSourceOwnedReturnCarrier(finalizedReturnCarrier)) {
    return finalizedReturnCarrier;
  }
  const directReturnType = safeGetTargetTypeRefForSubject(host, request.sourceReturnType, context);
  if (isFinalizedSourceOwnedReturnCarrier(directReturnType)) {
    return directReturnType;
  }
  return undefined;
}

function safeGetTargetTypeRefForSubject(
  host: CsharpOperationsProviderHost,
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  options?: Parameters<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>[2],
): TargetTypeRef | undefined {
  try {
    return host.getTargetTypeRefForSubject(subject, context, options);
  } catch {
    return undefined;
  }
}

function safeGetTargetTypeRefForType(
  host: CsharpOperationsProviderHost,
  type: Type | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  options?: Parameters<NonNullable<CsharpOperationsProviderHost["getTargetTypeRefForType"]>>[2],
): TargetTypeRef | undefined {
  try {
    return host.getTargetTypeRefForType?.(type, context, options);
  } catch {
    return undefined;
  }
}

function getSourceOwnedConstructionReturnType(
  call: ExtensionFactSubject | undefined,
  selectedDeclaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const callNode = asNodeSubject(call);
  const classDeclaration = getConstructedSourceClassDeclaration(selectedDeclaration, context);
  if (
    ast === undefined ||
    callNode === undefined ||
    classDeclaration === undefined ||
    ast.kindName(callNode) !== "KindNewExpression" ||
    ast.kindName(classDeclaration) !== "KindClassDeclaration"
  ) {
    return undefined;
  }
  const typeArguments = ast.typeArguments(callNode);
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const targetTypeArguments = typeArguments
    .map((argument) => getSourceOwnedConstructionTypeArgumentTargetRef(argument, context, host));
  if (targetTypeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const targetType = context.factResolver.resolve(classDeclaration, runtimeCarrierFactKey)?.carrier ??
    sourceDeclarationTargetType(getNodeNameText(classDeclaration), "KindClassDeclaration");
  if (targetType === undefined) {
    return undefined;
  }
  return targetTypeArguments.length === 0 || targetType.kind !== "target-named"
    ? targetType
    : {
        ...targetType,
        typeArguments: targetTypeArguments as readonly TargetTypeRef[],
      };
}

function getConstructedSourceClassDeclaration(
  selectedDeclaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): Node | undefined {
  const ast = context.compiler?.ast;
  if (selectedDeclaration === undefined || ast === undefined) {
    return undefined;
  }
  if (ast.kindName(selectedDeclaration) === "KindClassDeclaration") {
    return selectedDeclaration;
  }
  const parent = ast.parent(selectedDeclaration);
  return ast.kindName(selectedDeclaration) === "KindConstructor" &&
    parent !== undefined &&
    ast.kindName(parent) === "KindClassDeclaration"
    ? parent
    : undefined;
}

function getSourceOwnedConstructionTypeArgumentTargetRef(
  typeArgument: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  if (typeArgument === undefined) {
    return undefined;
  }
  const direct = safeGetTargetTypeRefForSubject(host, typeArgument, context);
  if (direct !== undefined) {
    return direct;
  }
  if (context.compiler === undefined || host.getTargetTypeRefForType === undefined) {
    return undefined;
  }
  const sourceFile = context.compiler.ast.getSourceFile(typeArgument);
  try {
    const semanticType = context.compiler.checker.getTypeFromTypeNode(typeArgument, { sourceFile });
    return safeGetTargetTypeRefForType(host, semanticType, context, { sourceFile });
  } catch {
    return undefined;
  }
}

function getExplicitCallMethodTargetTypeArguments(
  call: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): readonly TargetTypeRef[] | undefined {
  const ast = context.compiler?.ast;
  const callNode = asNodeSubject(call);
  if (ast === undefined || callNode === undefined || !ast.is.IsCallExpression(callNode)) {
    return undefined;
  }
  const typeArguments = getAstTypeArguments(ast, callNode);
  if (typeArguments.length === 0) {
    return undefined;
  }
  const targetTypeArguments = typeArguments.map((argument) =>
    getSourceOwnedConstructionTypeArgumentTargetRef(argument, context, host)
  );
  return targetTypeArguments.some((argument) => argument === undefined)
    ? undefined
    : targetTypeArguments as readonly TargetTypeRef[];
}

function substituteSourceOwnedCallableTypeParameters(
  targetType: TargetTypeRef | undefined,
  request: CheckedCallMappingRequest,
  selectedDeclaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  if (targetType === undefined) {
    return undefined;
  }
  const substitutions = new Map<string, TargetTypeRef>();
  addExplicitCallTypeArgumentSubstitutions(substitutions, request.call, selectedDeclaration, context, host);
  addReceiverDeclaringTypeArgumentSubstitutions(substitutions, request, selectedDeclaration, context, host);
  return substitutions.size === 0
    ? targetType
    : substituteTargetTypeRef(targetType, substitutions);
}

function addExplicitCallTypeArgumentSubstitutions(
  substitutions: Map<string, TargetTypeRef>,
  call: ExtensionFactSubject | undefined,
  selectedDeclaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): void {
  const ast = context.compiler?.ast;
  const callNode = asNodeSubject(call);
  if (ast === undefined || callNode === undefined || selectedDeclaration === undefined) {
    return;
  }
  const typeParameters = getAstTypeParameters(ast, selectedDeclaration);
  const typeArguments = getAstTypeArguments(ast, callNode);
  if (typeParameters.length === 0 || typeArguments.length === 0) {
    return;
  }
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter === undefined || argument === undefined) {
      continue;
    }
    const name = ast.text(ast.name(parameter));
    const targetType = getSourceOwnedConstructionTypeArgumentTargetRef(argument, context, host);
    if (name.length > 0 && targetType !== undefined) {
      substitutions.set(name, targetType);
    }
  }
}

function addReceiverDeclaringTypeArgumentSubstitutions(
  substitutions: Map<string, TargetTypeRef>,
  request: CheckedCallMappingRequest,
  selectedDeclaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): void {
  const ast = context.compiler?.ast;
  const declaringType = getContainingSourceTypeDeclaration(selectedDeclaration, context);
  if (ast === undefined || declaringType === undefined) {
    return;
  }
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const receiverType = safeGetTargetTypeRefForSubject(host, requestContext.calleeReceiver, context, { allowSemanticTypeQuery: false }) ??
    safeGetTargetTypeRefForSubject(host, requestContext.calleeReceiverType, context, { allowSemanticTypeQuery: false }) ??
    safeGetTargetTypeRefForSubject(host, requestContext.calleeReceiverType, context, { allowSemanticTypeQuery: true }) ??
    safeGetTargetTypeRefForSubject(host, requestContext.calleeReceiver, context, { allowSemanticTypeQuery: true });
  const receiverTypeArguments = receiverType?.kind === "target-named" && (receiverType.typeArguments ?? []).length > 0
    ? receiverType.typeArguments ?? []
    : getReceiverExpressionTypeArguments(requestContext.calleeReceiver, context, host);
  if (receiverTypeArguments.length === 0) {
    return;
  }
  const typeParameters = getAstTypeParameters(ast, declaringType);
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = receiverTypeArguments[index];
    if (parameter === undefined || argument === undefined) {
      continue;
    }
    const name = ast.text(ast.name(parameter));
    if (name.length > 0) {
      substitutions.set(name, argument);
    }
  }
}

function getReceiverExpressionTypeArguments(
  receiver: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): readonly TargetTypeRef[] {
  const ast = context.compiler?.ast;
  const receiverNode = asNodeSubject(receiver);
  if (ast === undefined || receiverNode === undefined) {
    return [];
  }
  const typeArguments = getAstTypeArguments(ast, receiverNode);
  if (typeArguments.length === 0) {
    return [];
  }
  const targetTypeArguments = typeArguments
    .map((argument) => getSourceOwnedConstructionTypeArgumentTargetRef(argument, context, host));
  return targetTypeArguments.some((argument) => argument === undefined)
    ? []
    : targetTypeArguments as readonly TargetTypeRef[];
}

function getAstTypeParameters(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly Node[] {
  const reader = ast as { readonly typeParameters?: (node: Node) => readonly Node[] };
  try {
    return typeof reader.typeParameters === "function" ? reader.typeParameters(node) : [];
  } catch {
    return [];
  }
}

function getAstTypeArguments(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly Node[] {
  const reader = ast as { readonly typeArguments?: (node: Node) => readonly Node[] };
  try {
    return typeof reader.typeArguments === "function" ? reader.typeArguments(node) : [];
  } catch {
    return [];
  }
}

function getContainingSourceTypeDeclaration(
  declaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): Node | undefined {
  const ast = context.compiler?.ast;
  if (declaration === undefined || ast === undefined) {
    return undefined;
  }
  for (let current = ast.parent(declaration); current !== undefined; current = ast.parent(current)) {
    const kind = ast.kindName(current);
    if (kind === "KindClassDeclaration" || kind === "KindInterfaceDeclaration") {
      return current;
    }
    if (kind === "KindSourceFile") {
      return undefined;
    }
  }
  return undefined;
}

function getSourceReturnCarrierForSubjects(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetTypeRef | undefined {
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const carrier = context.facts.get(subject, csharpSourceReturnCarrierFactKey)?.carrier ??
      context.factResolver.resolve(subject, csharpSourceReturnCarrierFactKey)?.carrier;
    if (carrier !== undefined) {
      return carrier;
    }
  }
  return undefined;
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

function getSourceOwnedCallableReturnTypeNode(
  declaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): Node | undefined {
  const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
  if (typeNode === undefined) {
    return undefined;
  }
  const ast = context.compiler?.ast;
  return sourceCallableDeclarationUsesFunctionTypeAsCallSignature(declaration, context) &&
    (ast?.is.IsFunctionTypeNode(typeNode) === true || ast?.is.IsConstructorTypeNode(typeNode) === true)
    ? asNodeSubject(getNodeField(typeNode, "Type"))
    : typeNode;
}

function sourceCallableDeclarationUsesFunctionTypeAsCallSignature(
  declaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  const ast = context.compiler?.ast;
  if (declaration === undefined || ast === undefined) {
    return false;
  }
  switch (ast.kindName(declaration)) {
    case "KindVariableDeclaration":
    case "KindParameter":
    case "KindParameterDeclaration":
    case "KindBindingElement":
    case "KindPropertyDeclaration":
    case "KindPropertySignature":
      return true;
    default:
      return false;
  }
}

function getSourceOwnedCallableReturnTargetType(
  returnTypeNode: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  const direct = safeGetTargetTypeRefForSubject(host, returnTypeNode, context);
  if (direct !== undefined || returnTypeNode === undefined || host.getTargetTypeRefForType === undefined) {
    return direct;
  }
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(returnTypeNode);
  let semanticType: Type | undefined;
  try {
    semanticType = compiler.checker.getTypeFromTypeNode(returnTypeNode, { sourceFile });
  } catch {
    return undefined;
  }
  const semantic = safeGetTargetTypeRefForType(host, semanticType, context, { sourceFile });
  return isFinalizedSourceOwnedReturnCarrier(semantic, returnTypeNode, context) ? semantic : undefined;
}

function isFinalizedSourceOwnedReturnCarrier(
  carrier: TargetTypeRef | undefined,
  returnTypeNode?: Node,
  context?: ExtensionObservationContext<"operation.mapCheckedCall">,
): carrier is TargetTypeRef {
  if (carrier === undefined) {
    return false;
  }
  if (isCsharpAnyRuntimeCarrier(carrier)) {
    return false;
  }
  if (isVoidTargetType(carrier)) {
    return false;
  }
  if (!targetTypeRefIsClosed(carrier)) {
    return false;
  }
  const returnTypeKind = returnTypeNode === undefined ? undefined : context?.compiler?.ast.kindName(returnTypeNode);
  if (returnTypeKind === "KindArrayType" && carrier.kind === "array") {
    return false;
  }
  return !(returnTypeNode === undefined && carrier.kind === "array" && targetTypeRefContainsSourcePrimitive(carrier));
}

function getSourceOwnedCallDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): Node | undefined {
  const selectedDeclaration = asNodeSubject(request.sourceSelectedDeclaration) ??
    getSignatureDeclaration(request.sourceSelectedSignature, context);
  if (sourceDeclarationIsOwnedProjectDeclaration(selectedDeclaration, context)) {
    return selectedDeclaration;
  }
  const symbolDeclaration = getUniqueCalleeDeclaration(request, context);
  if (
    sourceDeclarationIsOwnedProjectDeclaration(symbolDeclaration, context) &&
    isSourceCallableSymbolDeclaration(symbolDeclaration, request, context, host)
  ) {
    return symbolDeclaration;
  }
  return undefined;
}

function getSignatureDeclaration(
  signature: CheckedCallMappingRequest["sourceSelectedSignature"],
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): Node | undefined {
  const checker = context.compiler?.checker;
  if (signature === undefined || checker === undefined) {
    return undefined;
  }
  return typeof checker.getSignatureDeclaration === "function"
    ? asNodeSubject(checker.getSignatureDeclaration(signature as Signature))
    : undefined;
}

function getUniqueCalleeDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): Node | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const callee = asNodeSubject(request.callee);
  const sourceFile = callee === undefined ? undefined : compiler.ast.getSourceFile(callee);
  const resolvedSymbol = request.sourceCalleeSymbol ??
    (callee === undefined ? undefined : compiler.checker.getResolvedSymbolOrNil(callee, { sourceFile }));
  const declarations = getSymbolDeclarations(resolvedSymbol, compiler.checker);
  return declarations.length === 1 ? declarations[0] : undefined;
}

function sourceDeclarationIsOwnedProjectDeclaration(
  declaration: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): declaration is Node {
  return declaration !== undefined &&
    context.compiler !== undefined &&
    !isAmbientOrExternalDeclaration(declaration, context);
}

function isSourceCallableSymbolDeclaration(
  declaration: Node,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): boolean {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return false;
  }
  switch (ast.kindName(declaration)) {
    case "KindFunctionDeclaration":
    case "KindFunctionExpression":
    case "KindArrowFunction":
    case "KindMethodDeclaration":
    case "KindConstructor":
    case "KindClassDeclaration":
      return true;
    case "KindVariableDeclaration":
      return isDirectCallableSyntax(asNodeSubject(getNodeField(declaration, "Initializer")), context);
    case "KindBindingElement":
      return isCsharpDelegateTargetRef(
        host.getTargetTypeRefForSubject(request.callee, context, { allowRuntimeCarrier: true, allowSemanticTypeQuery: false }) ??
          host.getTargetTypeRefForSubject(request.call, context, { allowRuntimeCarrier: true, allowSemanticTypeQuery: false }),
      );
    default:
      return false;
  }
}

function isDirectCallableSyntax(
  node: Node | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  const ast = context.compiler?.ast;
  if (node === undefined || ast === undefined) {
    return false;
  }
  switch (ast.kindName(node)) {
    case "KindFunctionDeclaration":
    case "KindFunctionExpression":
    case "KindArrowFunction":
    case "KindMethodDeclaration":
    case "KindConstructor":
      return true;
    default:
      return false;
  }
}

function isCsharpDelegateTargetRef(type: ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>): boolean {
  return typeof (type as { readonly csharpDelegateSignature?: unknown } | undefined)?.csharpDelegateSignature === "object";
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
  const callNode = asNodeSubject(request.call);
  const isConstruction = callNode !== undefined && compiler.ast.is.IsNewExpression(callNode);
  return rejectObservation(csharpProviderDiagnostic(
    extensionId,
    "CSHARP_EXTERNAL_CALL_NOT_MAPPED",
    9100161,
    isConstruction
      ? `C# target requires selected target facts for external TypeScript declaration call '${requestContext.calleePropertyName ?? "<anonymous>"}'; C# construction emission requires a source-owned constructor or a selected target constructor fact.`
      : `C# target requires selected target facts for external TypeScript declaration call '${requestContext.calleePropertyName ?? "<anonymous>"}'.`,
    [
      {
        message: "Missing selected target mapping",
        details: {
          sourceDeclarationFile: compiler.ast.getFileName(declarationSourceFile),
          calleePropertyName: requestContext.calleePropertyName,
          operation: isConstruction ? "construct" : "call",
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
