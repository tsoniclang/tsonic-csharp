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
  Node,
  ProviderVirtualDeclarationFact,
  SelectedTargetSignatureFact,
  Signature,
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
  isCsharpSourceOwnedSelectedSignature,
} from "../source-owned-selected-signature.js";
import type {
  TargetMemberSelectionOptions,
} from "../target-member-arguments/index.js";
import {
  getTargetArgumentConversionTypes,
} from "../target-member-arguments/index.js";
import {
  findUnsupportedProviderTargetMember,
} from "../provider-unsupported-members.js";
import {
  targetMemberIsClosed,
  targetTypeRefEquals,
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
  getNodeField,
} from "../ast-utils.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";
import {
  isAmbientOrExternalDeclaration,
} from "../source-declaration-utils.js";

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
    const existingSignatureDiagnostic = getSelectedSignatureArgumentConversionDiagnostic(
      existingSelectedSignature,
      request.arguments.length,
      request.call,
      extensionId,
    );
    if (existingSignatureDiagnostic !== undefined) {
      return rejectObservation(existingSignatureDiagnostic);
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
  const declaringTargetType = member.kind === "constructor"
    ? constructorDeclaringTargetType ?? member.declaringType
    : getReceiverDeclaringTargetType(request, context, host);
  if (member.kind === "constructor" && declaringTargetType === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_CONSTRUCTOR_RESULT_TYPE_NOT_PROVEN", 9100135, `C# provider selected constructor '${member.id}', but no provider target type fact proved the constructed target type.`));
  }
  const csharpMember = instantiateSelectedTargetMember({ member }, host, { declaringTargetType });
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
      ...(virtualDeclaration?.signatureId === undefined ? {} : { providerDeclaration: virtualDeclaration }),
    },
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
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
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: csharpSourceOwnedSelectedSignatureFact({
      ...(request.sourceSelectedSignature === undefined ? {} : { sourceSignature: request.sourceSelectedSignature }),
      sourceDeclaration: declaration,
      ...(returnType === undefined ? {} : { returnType }),
    }),
  }, [{ message: "C# target observed a TSTS-selected project source call; backend emission remains source-owned and target facts are not inferred from source spelling." }]);
}

function getSourceOwnedCallReturnType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  const directReturnType = host.getTargetTypeRefForSubject(request.sourceReturnType, context);
  if (directReturnType !== undefined) {
    return directReturnType;
  }
  const checkedCallType = host.getTargetTypeRefForSubject(request.call, context, { allowSemanticTypeQuery: false });
  if (checkedCallType !== undefined) {
    return checkedCallType;
  }
  const checker = context.compiler?.checker;
  if (checker === undefined || request.sourceSelectedSignature === undefined || host.getTargetTypeRefForType === undefined) {
    return undefined;
  }
  const signatureDeclaration = getSignatureDeclaration(request.sourceSelectedSignature, context);
  const sourceFile = signatureDeclaration === undefined ? undefined : context.compiler?.ast.getSourceFile(signatureDeclaration);
  const sourceReturnType = checker.getReturnTypeOfSignature(request.sourceSelectedSignature as Signature, { sourceFile });
  return host.getTargetTypeRefForType(sourceReturnType, context, { sourceFile });
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
  return asNodeSubject(checker.getSignatureDeclaration(signature as Signature));
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
