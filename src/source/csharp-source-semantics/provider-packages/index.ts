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
  CsharpTargetBindingFact,
  CsharpTargetNamedTypeRef,
  CsharpTargetTypeRenderShape,
} from "../target-types.js";
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
export const csharpTargetBindingsContributionKind = "csharp-target-bindings";

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

export interface CsharpTargetBindingsContribution extends TargetCapabilityContribution {
  readonly kind: typeof csharpTargetBindingsContributionKind;
  readonly bindings: readonly CsharpCapabilityTargetBinding[];
}

export interface CsharpCapabilityTargetBinding extends Pick<
  CsharpTargetBindingFact,
  "id" | "sourceName" | "targetName" | "target" | "kind" | "csharpType" | "csharpBaseType" | "typeParameters" | "implementedContracts"
> {
  readonly csharpType: CsharpTargetNamedTypeRef;
}

export interface CsharpTargetCapabilityContributions {
  readonly providerOperations: readonly CsharpProviderOperationsContribution[];
  readonly dotnetProviders: readonly CsharpDotnetProviderContribution[];
  readonly targetBindings: readonly CsharpTargetBindingFact[];
}

export function createCsharpTargetCapabilityContributions(
  context: TargetProviderContext,
): CsharpTargetCapabilityContributions {
  const providerOperations: CsharpProviderOperationsContribution[] = [];
  const dotnetProviders: CsharpDotnetProviderContribution[] = [];
  const targetBindings: CsharpTargetBindingFact[] = [];
  const targetBindingOwners = new Map<string, string>();
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
      } else if (contribution.kind === csharpTargetBindingsContributionKind) {
        const bindings = validateCsharpTargetBindingsContribution(capability.id, contribution);
        for (const binding of bindings) {
          const existingOwner = targetBindingOwners.get(binding.id);
          if (existingOwner !== undefined) {
            throw new Error(`C# target capability '${capability.id}' target binding '${binding.id}' conflicts with capability '${existingOwner}'.`);
          }
          targetBindingOwners.set(binding.id, capability.id);
          targetBindings.push(binding);
        }
      }
    }
  }
  return Object.freeze({
    providerOperations: Object.freeze(providerOperations),
    dotnetProviders: Object.freeze(dotnetProviders),
    targetBindings: Object.freeze(targetBindings),
  });
}

function validateCsharpTargetBindingsContribution(
  capabilityId: string,
  contribution: TargetCapabilityContribution,
): readonly CsharpCapabilityTargetBinding[] {
  if (!isRecord(contribution) || !Array.isArray(contribution.bindings) || contribution.bindings.length === 0) {
    throw new Error(`C# target capability '${capabilityId}' supplied an invalid '${csharpTargetBindingsContributionKind}' contribution.`);
  }
  const ids = new Set<string>();
  return Object.freeze(contribution.bindings.map((candidate, index) => {
    if (!isCsharpCapabilityTargetBinding(candidate) || ids.has(candidate.id)) {
      throw new Error(`C# target capability '${capabilityId}' supplied an invalid '${csharpTargetBindingsContributionKind}' binding at index ${index}.`);
    }
    ids.add(candidate.id);
    return freezeSnapshot(candidate);
  }));
}

function isCsharpCapabilityTargetBinding(value: unknown): value is CsharpCapabilityTargetBinding {
  if (!isRecord(value) ||
      !isNonEmptyString(value.id) ||
      !isNonEmptyString(value.sourceName) ||
      !isNonEmptyString(value.targetName) ||
      value.target !== "csharp" ||
      !isTargetBindingKind(value.kind) ||
      !isRecord(value.csharpType) ||
      value.csharpType.kind !== "target-named" ||
      value.csharpType.id !== value.id ||
      !isCsharpTargetNamedTypeRef(value.csharpType)) {
    return false;
  }
  return (value.csharpBaseType === undefined || isTargetTypeRef(value.csharpBaseType)) &&
    (value.typeParameters === undefined || (Array.isArray(value.typeParameters) && value.typeParameters.every(isTargetTypeParameter))) &&
    (value.implementedContracts === undefined || (Array.isArray(value.implementedContracts) && value.implementedContracts.every(isTargetConstraint))) &&
    value.members === undefined &&
    value.attributes === undefined &&
    value.unsupportedAttributes === undefined &&
    value.conversionOperators === undefined &&
    value.csharpRender === undefined;
}

function isTargetBindingKind(value: unknown): boolean {
  return value === "class" || value === "struct" || value === "interface" || value === "trait" ||
    value === "enum" || value === "delegate" || value === "function" || value === "opaque";
}

function isCsharpTargetNamedTypeRef(value: Readonly<Record<string, unknown>>): value is CsharpTargetNamedTypeRef {
  return typeof value.id === "string" && value.id.length > 0 &&
    (value.typeArguments === undefined || (Array.isArray(value.typeArguments) && value.typeArguments.every(isTargetTypeRef))) &&
    isCsharpRenderShape(value.csharpRender);
}

function isTargetTypeRef(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  switch (value.kind) {
    case "source-primitive":
    case "type-parameter":
      return typeof value.name === "string" && value.name.length > 0;
    case "source-global":
      return typeof value.name === "string" && value.name.length > 0 &&
        (value.typeArguments === undefined || (Array.isArray(value.typeArguments) && value.typeArguments.every(isTargetTypeRef)));
    case "target-named":
      return typeof value.id === "string" && value.id.length > 0 &&
        (value.typeArguments === undefined || (Array.isArray(value.typeArguments) && value.typeArguments.every(isTargetTypeRef)));
    case "array":
      return isTargetTypeRef(value.element) && (value.rank === undefined || (Number.isSafeInteger(value.rank) && Number(value.rank) > 0));
    case "tuple":
      return Array.isArray(value.elements) && value.elements.every(isTargetTypeRef);
    case "pointer":
      return isTargetTypeRef(value.pointee) &&
        (value.mutability === undefined || value.mutability === "mut" || value.mutability === "const" || value.mutability === "target-defined");
    case "function-pointer":
      return Array.isArray(value.args) && value.args.every(isTargetTypeRef) && isTargetTypeRef(value.result) &&
        (value.abi === undefined || (Array.isArray(value.abi) && value.abi.every((entry) => typeof entry === "string")));
    case "opaque":
      return typeof value.id === "string" && value.id.length > 0;
    case "target-specific":
      return typeof value.target === "string" && value.target.length > 0 && typeof value.name === "string" && value.name.length > 0;
    case "associated-type":
      return typeof value.name === "string" && value.name.length > 0 && isTargetTypeRef(value.owner);
    case "lifetime":
      return typeof value.name === "string" && value.name.length > 0;
    default:
      return false;
  }
}

function isTargetTypeParameter(value: unknown): boolean {
  return isRecord(value) && typeof value.name === "string" && value.name.length > 0 &&
    (value.variance === undefined || value.variance === "in" || value.variance === "out" || value.variance === "invariant" || value.variance === "target-defined") &&
    (value.constraints === undefined || (Array.isArray(value.constraints) && value.constraints.every(isTargetConstraint)));
}

function isTargetConstraint(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  switch (value.kind) {
    case "implements":
      return typeof value.contract === "string" && value.contract.length > 0 &&
        (value.typeArguments === undefined || (Array.isArray(value.typeArguments) && value.typeArguments.every(isTargetTypeRef)));
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
    case "copy":
    case "clone":
    case "default":
    case "sized":
      return true;
    case "lifetime":
      return typeof value.name === "string" && value.name.length > 0;
    case "target-specific":
      return typeof value.target === "string" && value.target.length > 0 && typeof value.name === "string" && value.name.length > 0;
    default:
      return false;
  }
}

function isCsharpRenderShape(value: unknown): value is CsharpTargetTypeRenderShape {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === "predefined") {
    return typeof value.name === "string" && value.name.length > 0;
  }
  if (value.kind === "nullable") {
    return true;
  }
  return value.kind === "named" &&
    typeof value.name === "string" && value.name.length > 0 &&
    (value.externAlias === undefined || (typeof value.externAlias === "string" && value.externAlias.length > 0)) &&
    (value.namespace === undefined || (Array.isArray(value.namespace) && value.namespace.every((part) => typeof part === "string" && part.length > 0))) &&
    (value.genericArity === undefined || (Number.isSafeInteger(value.genericArity) && Number(value.genericArity) >= 0)) &&
    (value.nested === undefined || (Array.isArray(value.nested) && value.nested.every((nested) =>
      isRecord(nested) && typeof nested.name === "string" && nested.name.length > 0 &&
      (nested.genericArity === undefined || (Number.isSafeInteger(nested.genericArity) && Number(nested.genericArity) >= 0)))));
}

function freezeSnapshot<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeSnapshot(entry))) as T;
  }
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freezeSnapshot(entry)]))) as T;
  }
  return value;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
