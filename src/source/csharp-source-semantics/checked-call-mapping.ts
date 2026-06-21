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
  TargetMember,
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
} from "./provider-bindings.js";
import {
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";
import {
  findTargetMemberForCall,
  selectTargetMember,
} from "./target-member-selection.js";
import {
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import {
  targetMemberIsClosed,
} from "./target-ref-utils.js";
import {
  erasedSourceSemanticsMember,
  isCheckedAttributeBuilderCall,
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
  if (isCheckedAttributeBuilderCall(request, context)) {
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedSourceSemanticsMember(undefined, request) },
    }, [{ message: "C# attribute builder marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  const virtualDeclaration = context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  if (isErasedSourceSemanticsCall(virtualDeclaration)) {
    return acceptObservation<CheckedCallMappingResult>({
      selectedSignature: { member: erasedSourceSemanticsMember(virtualDeclaration, request) },
    }, [{ message: "C# source-semantics marker call was checked by TSTS and marked for fact-driven erasure." }]);
  }
  const binding = findTargetBinding(context, [
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
  if (binding === undefined) {
    return deferObservation;
  }
  const member = request.calleePropertyName === undefined && binding.members?.some((candidate) => candidate.kind === "constructor") === true
    ? findTargetConstructorForCall(binding, request, context, host)
    : findTargetMemberForCall(
      binding,
      context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey),
      request,
      context,
      host.getTargetTypeRefForSubject,
    );
  if (member === undefined) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_FOUND", 9100100, `C# provider could not map checked call '${request.calleePropertyName ?? "<anonymous>"}' on target '${binding.id}'.`));
  }
  if (member.kind !== "method" && member.kind !== "constructor") {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_CALLABLE", 9100101, `C# provider mapped checked call '${request.calleePropertyName ?? "<anonymous>"}' to non-callable target member '${member.id}'.`));
  }
  const declaringTargetType = member.kind === "constructor" ? member.declaringType : host.getTargetTypeRefForSubject(request.calleeReceiverType, context) ??
    host.getTargetTypeRefForSubject(request.calleeReceiver, context) ??
    host.getTargetTypeRefForSubject(request.call, context);
  const csharpMember = member.kind === "constructor"
    ? member
    : instantiateSelectedTargetMember({ member }, host, { declaringTargetType });
  if (csharpMember === undefined || !targetMemberIsClosed(csharpMember)) {
    return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_MEMBER_NOT_RENDERABLE", 9100104, `C# provider selected '${member.id}', but no closed renderable C# target member fact could be produced from provider target identity.`));
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(csharpMember), [{ message: "C# target call operation finalized from checked TSTS selection and provider target identity." }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: csharpMember },
  }, [{ message: "C# target call selected from checked TSTS provider declaration." }]);
}

function findTargetConstructorForCall(
  binding: NonNullable<ReturnType<typeof findTargetBinding>>,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
): TargetMember | undefined {
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
  const candidates = (binding.members ?? [])
    .filter((member) => member.kind === "constructor")
    .map((member) => instantiateSelectedTargetMember({ member }, host, { declaringTargetType }))
    .filter((member): member is TargetMember => member !== undefined);
  return selectTargetMember(candidates, {
    arguments: request.arguments,
  }, context, host.getTargetTypeRefForSubject);
}
