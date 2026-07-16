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
import type {
  DotnetAssemblySourcePackage,
  DotnetModuleSpecifierPolicy,
} from "../../../providers/dotnet/module-specifier.js";
import {
  createDotnetModuleSpecifierPolicy,
  normalizeDotnetAssemblySourcePackages,
} from "../../../providers/dotnet/module-specifier.js";
import type {
  DotnetProviderIdentity,
} from "../../../providers/dotnet/model.js";

export const csharpProviderOperationsContributionKind = "csharp-provider-operations";
export const csharpDotnetProviderContributionKind = "csharp-dotnet-provider";

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

export interface CsharpDotnetProviderContribution extends TargetCapabilityContribution {
  readonly kind: typeof csharpDotnetProviderContributionKind;
  readonly providerIdentity: DotnetProviderIdentity;
  readonly moduleSpecifierPolicy: DotnetModuleSpecifierPolicy;
  readonly referenceDirectoryUrl: string;
  readonly assemblySourcePackages: readonly DotnetAssemblySourcePackage[];
  readonly targetFramework?: string;
}

export interface CsharpTargetCapabilityContributions {
  readonly providerOperations: readonly CsharpProviderOperationsContribution[];
  readonly dotnetProviders: readonly CsharpDotnetProviderContribution[];
}

export function createCsharpTargetCapabilityContributions(
  context: TargetProviderContext,
): CsharpTargetCapabilityContributions {
  const providerOperations: CsharpProviderOperationsContribution[] = [];
  const dotnetProviders: CsharpDotnetProviderContribution[] = [];
  for (const capability of context.selectedCapabilities ?? []) {
    const rawContributions = capability.createTargetContributions?.({
      project: context.project,
      target: context.target,
      targetPack: context.targetPack,
      selectedCapabilities: context.selectedCapabilities,
      selectedSurfaces: context.selectedSurfaces,
      capability,
    }) ?? [];
    if (!Array.isArray(rawContributions) || rawContributions.some((contribution) => !isRecord(contribution) || typeof contribution.kind !== "string" || contribution.kind.length === 0)) {
      throw new Error(`C# target capability '${capability.id}' supplied invalid target contributions.`);
    }
    const contributions = rawContributions as readonly TargetCapabilityContribution[];
    for (const contribution of contributions) {
      if (contribution.kind === csharpProviderOperationsContributionKind) {
        providerOperations.push(validateCsharpProviderOperationsContribution(capability.id, contribution));
      } else if (contribution.kind === csharpDotnetProviderContributionKind) {
        dotnetProviders.push(validateCsharpDotnetProviderContribution(capability.id, capability.moduleOwnership, contribution));
      }
    }
  }
  return Object.freeze({
    providerOperations: Object.freeze(providerOperations),
    dotnetProviders: Object.freeze(dotnetProviders),
  });
}

function validateCsharpProviderOperationsContribution(
  capabilityId: string,
  contribution: TargetCapabilityContribution,
): CsharpProviderOperationsContribution {
  if (!isRecord(contribution) || !optionalFunction(contribution.mapCheckedCall) || !optionalFunction(contribution.mapCheckedPropertyAccess) || !optionalFunction(contribution.mapCheckedElementAccess)) {
    throw new Error(`C# target capability '${capabilityId}' supplied an invalid '${csharpProviderOperationsContributionKind}' contribution.`);
  }
  return contribution as unknown as CsharpProviderOperationsContribution;
}

function validateCsharpDotnetProviderContribution(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  contribution: TargetCapabilityContribution,
): CsharpDotnetProviderContribution {
  if (!isRecord(contribution) || !isDotnetProviderIdentity(contribution.providerIdentity) || !isRecord(contribution.moduleSpecifierPolicy) || !isFileDirectoryUrl(contribution.referenceDirectoryUrl) || !Array.isArray(contribution.assemblySourcePackages) || (contribution.targetFramework !== undefined && typeof contribution.targetFramework !== "string")) {
    throw new Error(`C# target capability '${capabilityId}' supplied an invalid '${csharpDotnetProviderContributionKind}' contribution.`);
  }
  const policy = createDotnetModuleSpecifierPolicy(String(contribution.moduleSpecifierPolicy.packageName));
  if (contribution.moduleSpecifierPolicy.modulePrefix !== policy.modulePrefix || !moduleOwnership.some((ownership) => ownership.specifierPrefix === policy.modulePrefix)) {
    throw new Error(`C# target capability '${capabilityId}' .NET provider source package '${policy.packageName}' is not owned by the capability module contract.`);
  }
  const assemblySourcePackages = normalizeDotnetAssemblySourcePackages(contribution.assemblySourcePackages as readonly DotnetAssemblySourcePackage[]);
  if (!assemblySourcePackages.some((sourcePackage) => sourcePackage.packageName === policy.packageName)) {
    throw new Error(`C# target capability '${capabilityId}' .NET provider contribution does not map any source assembly to '${policy.packageName}'.`);
  }
  return Object.freeze({
    kind: csharpDotnetProviderContributionKind,
    providerIdentity: Object.freeze({ ...(contribution.providerIdentity as unknown as DotnetProviderIdentity) }),
    moduleSpecifierPolicy: policy,
    referenceDirectoryUrl: new URL(contribution.referenceDirectoryUrl).href,
    assemblySourcePackages,
    ...(contribution.targetFramework === undefined ? {} : { targetFramework: contribution.targetFramework }),
  });
}

function isFileDirectoryUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "file:" && url.pathname.endsWith("/");
}

function isDotnetProviderIdentity(value: unknown): value is DotnetProviderIdentity {
  return isRecord(value) &&
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.version === "string" && value.version.length > 0 &&
    value.target === "csharp" &&
    typeof value.displayName === "string" && value.displayName.length > 0;
}

function optionalFunction(value: unknown): boolean {
  return value === undefined || typeof value === "function";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
