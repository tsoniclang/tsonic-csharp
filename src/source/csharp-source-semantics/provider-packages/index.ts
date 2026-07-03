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
  TargetCapabilityContext,
  TargetCapabilityImplementation,
} from "@tsonic/target-api";

export interface CsharpProviderPackageOperationsMapper {
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

export interface CsharpProviderPackageOperationMapperContributor extends TargetCapabilityImplementation {
  readonly createCsharpOperationsMappers?: (
    context: TargetCapabilityContext,
  ) => readonly CsharpProviderPackageOperationsMapper[];
}

export function createCsharpProviderPackageOperationsMappers(
  context: TargetProviderContext,
): readonly CsharpProviderPackageOperationsMapper[] {
  return (context.selectedCapabilities ?? []).flatMap((providerPackage) => {
    const contributor = providerPackage as CsharpProviderPackageOperationMapperContributor;
    return contributor.createCsharpOperationsMappers?.({
      project: context.project,
      target: context.target,
      targetPack: context.targetPack,
      selectedCapabilities: context.selectedCapabilities,
      selectedSurfaces: context.selectedSurfaces,
      capability: providerPackage,
    }) ?? [];
  });
}
