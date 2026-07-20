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
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../target-types.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  getCsharpTargetTypeFromBinding,
} from "../target-enrichment.js";
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
  checkedCallIsConstruction,
  getCsharpCheckedCallRequestContext,
} from "../checked-call-request-context.js";
import {
  getApplicableSourceCallEvidence,
} from "../selected-source-evidence.js";
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
    (subject, resolutionContext, resolutionOptions) => host.getTargetTypeRefForSubject(subject, resolutionContext, resolutionOptions),
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
        sourceSelectedSignatureAvailable: getApplicableSourceCallEvidence(request) !== undefined,
        selectedExportName: declaration?.exportName,
        selectedMemberName: declaration?.memberName,
        selectedTargetIdentity: declaration?.targetIdentity,
        declaringTargetType: options.declaringTargetType,
        methodTargetTypeArguments: options.methodTargetTypeArguments,
        firstArgumentReceiver: options.firstArgumentReceiver === false ? false : options.firstArgumentReceiver !== undefined,
        sourceArgumentBindings: getApplicableSourceCallEvidence(request)?.argumentBindings,
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
  selectedTypeArguments: readonly TargetTypeRef[] | undefined,
): ReturnType<CsharpOperationsProviderHost["getTargetTypeRefForSubject"]> {
  const sourceReturnTargetType = host.getTargetTypeRefForSubject(request.sourceResult.type, context, {
    allowSemanticTypeQuery: false,
  });
  const selectedConstructedType = getSelectedConstructedProviderType(binding, selectedTypeArguments, host);
  if (
    selectedConstructedType !== undefined &&
    (sourceReturnTargetType === undefined ||
      (sourceReturnTargetType.kind === "target-named" && sourceReturnTargetType.id === binding.id))
  ) {
    return selectedConstructedType;
  }
  if (sourceReturnTargetType === undefined) {
    const typeParameters = binding.typeParameters ?? [];
    return typeParameters.length === 0 ? getCsharpTargetTypeFromBinding(binding, [], host) : undefined;
  }
  if (sourceReturnTargetType.kind !== "target-named" || sourceReturnTargetType.id !== binding.id) {
    return undefined;
  }
  return sourceReturnTargetType;
}

function getSelectedConstructedProviderType(
  binding: TargetBindingFact,
  selectedTypeArguments: readonly TargetTypeRef[] | undefined,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  if (selectedTypeArguments === undefined) {
    return undefined;
  }
  const typeParameters = binding.typeParameters ?? [];
  return typeParameters.length === selectedTypeArguments.length
    ? getCsharpTargetTypeFromBinding(binding, selectedTypeArguments, host)
    : undefined;
}

export function isProviderStaticContainerReceiver(
  declaration: ProviderVirtualDeclarationFact | undefined,
): boolean {
  return declaration?.memberStatic === true;
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
  if (declaration?.memberId !== undefined || declaration?.signatureId !== undefined || !checkedCallIsConstruction(request)) {
    return undefined;
  }
  return selectTargetMember(
    (binding.members ?? []).filter((candidate) => candidate.kind === "constructor"),
    {
      arguments: request.arguments.map((subject, index) => {
        const selectedType = request.sourceArguments[index]?.type;
        return selectedType === undefined ? { subject } : { subject, selectedType };
      }),
      ...(requestContext.calleeReceiver === undefined
        ? {}
        : {
            receiver: requestContext.calleeReceiverType === undefined
              ? { subject: requestContext.calleeReceiver }
              : { subject: requestContext.calleeReceiver, selectedType: requestContext.calleeReceiverType },
          }),
    },
    context,
    (subject, resolutionContext, resolutionOptions) => host.getTargetTypeRefForSubject(subject, resolutionContext, resolutionOptions),
    options,
  );
}
