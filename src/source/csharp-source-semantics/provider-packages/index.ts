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
} from "@tsonic/target-api";
import {
  csharpNodejsProviderPackageExtensionId,
} from "../identity.js";
import {
  createCsharpNodejsProviderPackageMappers,
} from "./nodejs/index.js";

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

export function createCsharpProviderPackageOperationsMappers(
  context: Pick<TargetProviderContext, "selectedPackages">,
): readonly CsharpProviderPackageOperationsMapper[] {
  return context.selectedPackages.flatMap((providerPackage) =>
    providerPackage.id === "nodejs"
      ? [createCsharpNodejsProviderPackageMappers(csharpNodejsProviderPackageExtensionId)]
      : []
  );
}
