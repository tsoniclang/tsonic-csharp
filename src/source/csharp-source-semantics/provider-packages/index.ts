import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  TargetProviderContext,
  TargetCapabilityContribution,
} from "@tsonic/target-api";

export const csharpProviderOperationsContributionKind = "csharp-provider-operations";

export interface CsharpProviderOperationsContribution extends TargetCapabilityContribution {
  readonly kind: typeof csharpProviderOperationsContributionKind;
  readonly mapCheckedCall?: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
  ) => ExtensionObservation<CheckedCallMappingResult>;
  readonly mapCheckedPropertyAccess?: (
    request: CheckedPropertyAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
  readonly mapCheckedElementAccess?: (
    request: CheckedElementAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
}

export function createCsharpProviderOperationsContributions(
  context: TargetProviderContext,
): readonly CsharpProviderOperationsContribution[] {
  return (context.selectedCapabilities ?? []).flatMap((capability) => {
    const contributions = capability.createTargetContributions?.({
      project: context.project,
      target: context.target,
      targetPack: context.targetPack,
      selectedCapabilities: context.selectedCapabilities,
      selectedSurfaces: context.selectedSurfaces,
      capability,
    }) ?? [];
    return contributions.filter(isCsharpProviderOperationsContribution);
  });
}

function isCsharpProviderOperationsContribution(
  contribution: TargetCapabilityContribution,
): contribution is CsharpProviderOperationsContribution {
  return contribution.kind === csharpProviderOperationsContributionKind;
}
