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
  TargetCapabilityOperationMapper,
} from "@tsonic/target-api";

export const csharpProviderPackageOperationsMapperKind = "csharp-provider-package-operations";

export interface CsharpProviderPackageOperationsMapper extends TargetCapabilityOperationMapper {
  readonly kind: typeof csharpProviderPackageOperationsMapperKind;
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

export function createCsharpProviderPackageOperationsMappers(
  context: TargetProviderContext,
): readonly CsharpProviderPackageOperationsMapper[] {
  return (context.selectedCapabilities ?? []).flatMap((providerPackage) => {
    const mappers = providerPackage.createOperationMappers?.({
      project: context.project,
      target: context.target,
      targetPack: context.targetPack,
      selectedCapabilities: context.selectedCapabilities,
      selectedSurfaces: context.selectedSurfaces,
      capability: providerPackage,
    }) ?? [];
    return mappers.filter(isCsharpProviderPackageOperationsMapper);
  });
}

function isCsharpProviderPackageOperationsMapper(
  mapper: TargetCapabilityOperationMapper,
): mapper is CsharpProviderPackageOperationsMapper {
  return mapper.kind === csharpProviderPackageOperationsMapperKind;
}
