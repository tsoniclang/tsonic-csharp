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
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
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
  dotnetNativeArrayCreateMemberId,
  dotnetNativeArrayTypeId,
  isDotnetNativeArrayCreateMemberId,
} from "../../providers/dotnet/native-array.js";
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
  findUnsupportedProviderTargetMember,
} from "./provider-unsupported-members.js";
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
  const nativeArrayCreate = mapDotnetNativeArrayCreateCall(request, context, extensionId, host, virtualDeclaration);
  if (nativeArrayCreate !== undefined) {
    return nativeArrayCreate;
  }
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
    const unsupportedMember = findUnsupportedProviderTargetMember(targetBinding, virtualDeclaration);
    if (unsupportedMember !== undefined) {
      return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_UNSUPPORTED", 9100130, `C# provider selected unsupported target ${unsupportedMember.memberKind} '${unsupportedMember.targetName}' on target '${targetBinding.id}'. ${unsupportedMember.reason}`));
    }
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
  const member = targetBinding?.members?.find((candidate) => isDotnetNativeArrayCreateMemberId(candidate.id)) ?? createDotnetNativeArrayTargetMember();
  if (targetBinding === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_CREATE_TARGET_FACT_NOT_PROVEN", 9100135, "C# native array creation requires finalized provider target binding facts for the explicit .NET Array source contract."));
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

function createDotnetNativeArrayTargetMember(): TargetMember {
  const typeParameter = { kind: "type-parameter", name: "T" } satisfies TargetTypeRef;
  return {
    id: dotnetNativeArrayCreateMemberId,
    sourceName: "create",
    targetName: "__tsonic_native_array_create",
    kind: "method",
    static: true,
    parameters: [
      {
        name: "length",
        type: { kind: "source-primitive", name: "int32" },
        passingMode: "by-value",
      },
    ],
    returnType: { kind: "array", element: typeParameter },
    typeParameters: [{ name: "T" }],
    overloadGroup: dotnetNativeArrayCreateMemberId,
  };
}

function getSelectedCallProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ProviderVirtualDeclarationFact | undefined {
  return context.facts.get(request.sourceSelectedSignature, providerVirtualDeclarationFactKey) ??
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey) ??
    getCalleePropertyProviderVirtualDeclaration(request, context);
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
  const sourceFile = compiler.ast.getSourceFile(propertyName);
  const propertySymbol = compiler.checker.getSymbolAtLocation(propertyName, { sourceFile });
  const resolvedPropertySymbol = compiler.checker.getResolvedSymbol(propertyName, { sourceFile });
  const aliasedPropertySymbol = compiler.checker.getAliasedSymbol(propertySymbol, { sourceFile });
  const aliasedResolvedPropertySymbol = compiler.checker.getAliasedSymbol(resolvedPropertySymbol, { sourceFile });
  return context.facts.get(propertyName, providerVirtualDeclarationFactKey) ??
    context.facts.get(propertySymbol, providerVirtualDeclarationFactKey) ??
    context.facts.get(resolvedPropertySymbol, providerVirtualDeclarationFactKey) ??
    context.facts.get(aliasedPropertySymbol, providerVirtualDeclarationFactKey) ??
    context.facts.get(aliasedResolvedPropertySymbol, providerVirtualDeclarationFactKey);
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
  ]) ?? resolveTargetBindingForReference(request.calleeReceiver, context);
  return receiverBinding?.target === targetBinding.target && receiverBinding.id === targetBinding.id;
}
