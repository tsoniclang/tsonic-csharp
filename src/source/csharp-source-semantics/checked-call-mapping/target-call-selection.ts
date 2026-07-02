import {
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionEvidence,
  ExtensionObservation,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../target-types.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  asNodeSubject,
} from "../ast-utils.js";
import {
  findTargetBinding,
} from "../provider-bindings.js";
import {
  findTargetMemberForCall,
  selectTargetMember,
} from "../target-member-selection.js";
import type {
  TargetMemberSelectionOptions,
} from "../target-member-arguments/index.js";
import {
  findUnsupportedProviderTargetMember,
  unsupportedProviderTargetMemberEvidence,
} from "../provider-unsupported-members.js";
import {
  getCsharpTargetTypeFromBinding,
} from "../target-enrichment.js";
import {
  getCsharpCheckedCallRequestContext,
} from "../checked-call-request-context.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";

export function getVirtualDeclarationSignatureId(declaration: ProviderVirtualDeclarationFact | undefined): string | undefined {
  return declaration === undefined ? undefined : declaration.signatureId;
}

export function rejectUnsupportedTargetMember(
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

export function findCsharpTargetMemberForCall(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
  options: TargetMemberSelectionOptions,
): CsharpTargetMember | undefined {
  const selectedMember = findTargetMemberForCall(
    binding,
    declaration,
    request,
    context,
    (subject, resolutionContext, resolutionOptions) => safeGetTargetTypeRefForSubject(host, subject, resolutionContext, resolutionOptions),
    options,
  );
  if (selectedMember !== undefined) {
    return selectedMember;
  }
  if (declaration?.signatureId !== undefined) {
    return undefined;
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

export function targetMemberMissEvidence(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  options: TargetMemberSelectionOptions,
): readonly ExtensionEvidence[] {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  return [
    {
      message: "C# provider target binding was resolved, but no target member matched the checked TSTS call observation.",
      details: {
        bindingId: binding.id,
        calleePropertyName: requestContext.calleePropertyName,
        argumentCount: request.arguments.length,
        hasReceiver: requestContext.calleeReceiver !== undefined,
        selectedMemberId: declaration?.memberId,
        selectedSignatureId: declaration?.signatureId,
        sourceSelectedSignatureAvailable: request.sourceSelectedSignature !== undefined,
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

export function getConstructorDeclaringTargetType(
  binding: TargetBindingFact,
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
    .map((argument) => safeGetTargetTypeRefForSubject(host, argument, context));
  if (targetTypeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const declaringTargetType = getCsharpTargetTypeFromBinding(binding, targetTypeArguments as NonNullable<typeof targetTypeArguments[number]>[], host);
  if (declaringTargetType === undefined) {
    return undefined;
  }
  return declaringTargetType;
}

export function isProviderStaticContainerReceiver(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  targetBinding: TargetBindingFact,
): boolean {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const receiverBinding = findTargetBinding(context, [
    requestContext.calleeReceiver,
    requestContext.calleeReceiverAliasedSymbol,
    requestContext.calleeReceiverResolvedSymbol,
    requestContext.calleeReceiverSymbol,
  ]);
  return receiverBinding?.target === targetBinding.target && receiverBinding.id === targetBinding.id;
}

function findConstructorTargetMemberForProviderType(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpOperationsProviderHost,
  options: TargetMemberSelectionOptions,
): CsharpTargetMember | undefined {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  if (declaration?.memberId !== undefined || declaration?.signatureId !== undefined || requestContext.calleePropertyName !== undefined) {
    return undefined;
  }
  return selectTargetMember(
    (binding.members ?? []).filter((candidate) => candidate.kind === "constructor"),
    {
      arguments: request.arguments,
      receiver: requestContext.calleeReceiver,
    },
    context,
    (subject, resolutionContext, resolutionOptions) => safeGetTargetTypeRefForSubject(host, subject, resolutionContext, resolutionOptions),
    options,
  );
}

function safeGetTargetTypeRefForSubject(
  host: CsharpOperationsProviderHost,
  subject: Parameters<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>[0],
  context: Parameters<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>[1],
  options?: Parameters<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]>[2],
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  try {
    return host.getTargetTypeRefForSubject(subject, context, options);
  } catch {
    return undefined;
  }
}
