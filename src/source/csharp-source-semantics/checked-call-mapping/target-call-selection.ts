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
  TargetMember,
} from "@tsonic/tsts";
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

export function targetMemberMissEvidence(
  binding: TargetBindingFact,
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

export function isProviderStaticContainerReceiver(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  targetBinding: TargetBindingFact,
): boolean {
  const receiverBinding = findTargetBinding(context, [
    request.calleeReceiver,
    request.calleeReceiverAliasedSymbol,
    request.calleeReceiverResolvedSymbol,
    request.calleeReceiverSymbol,
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
